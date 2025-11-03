import { supabase } from '@/integrations/supabase/client';

export interface OfflineAction {
  id: string;
  type: 'chat_message' | 'like' | 'comment' | 'favorite';
  payload: any;
  timestamp: Date;
  userId: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retryCount: number;
}

export class OfflineSyncManager {
  private static instance: OfflineSyncManager;
  private queue: OfflineAction[] = [];
  private isOnline = navigator.onLine;
  private syncInterval: number | null = null;

  static getInstance(): OfflineSyncManager {
    if (!OfflineSyncManager.instance) {
      OfflineSyncManager.instance = new OfflineSyncManager();
    }
    return OfflineSyncManager.instance;
  }

  constructor() {
    this.loadQueue();
    this.setupEventListeners();
    this.startSyncInterval();
  }

  private setupEventListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.syncPendingActions();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });

    // Sync when page becomes visible (user returns to tab)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isOnline) {
        this.syncPendingActions();
      }
    });
  }

  private startSyncInterval() {
    // Attempt sync every 30 seconds when online
    this.syncInterval = window.setInterval(() => {
      if (this.isOnline && this.queue.some(action => action.status === 'pending')) {
        this.syncPendingActions();
      }
    }, 30000);
  }

  private loadQueue() {
    try {
      const stored = localStorage.getItem('cineflix_sync_queue');
      if (stored) {
        this.queue = JSON.parse(stored).map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp)
        }));
      }
    } catch (error) {
      console.error('Error loading sync queue:', error);
      this.queue = [];
    }
  }

  private saveQueue() {
    try {
      localStorage.setItem('cineflix_sync_queue', JSON.stringify(this.queue));
    } catch (error) {
      console.error('Error saving sync queue:', error);
    }
  }

  addAction(action: Omit<OfflineAction, 'id' | 'status' | 'retryCount' | 'timestamp'>) {
    const newAction: OfflineAction = {
      ...action,
      id: crypto.randomUUID(),
      status: 'pending',
      retryCount: 0,
      timestamp: new Date()
    };

    this.queue.push(newAction);
    this.saveQueue();

    // If online, attempt immediate sync
    if (this.isOnline) {
      this.syncPendingActions();
    }

    return newAction.id;
  }

  async syncPendingActions() {
    const pendingActions = this.queue.filter(action => action.status === 'pending');
    
    if (pendingActions.length === 0) return;

    console.log(`Syncing ${pendingActions.length} pending actions...`);

    for (const action of pendingActions) {
      try {
        // Update status to syncing
        this.updateActionStatus(action.id, 'syncing');

        await this.syncSingleAction(action);

        // Mark as synced
        this.updateActionStatus(action.id, 'synced');
        
      } catch (error) {
        console.error(`Failed to sync action ${action.id}:`, error);
        
        // Increment retry count
        action.retryCount++;
        
        // Mark as failed if too many retries
        if (action.retryCount >= 3) {
          this.updateActionStatus(action.id, 'failed');
        } else {
          this.updateActionStatus(action.id, 'pending');
        }
      }
    }

    // Clean up old synced actions (older than 1 hour)
    this.cleanupOldActions();
  }

  private async syncSingleAction(action: OfflineAction) {
    switch (action.type) {
      case 'chat_message':
        await this.syncChatMessage(action);
        break;
      case 'like':
        await this.syncLike(action);
        break;
      case 'comment':
        await this.syncComment(action);
        break;
      case 'favorite':
        await this.syncFavorite(action);
        break;
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  private async syncChatMessage(action: OfflineAction) {
    const { message, conversationId } = action.payload;
    
    await supabase.functions.invoke('enhanced-ai-assistant', {
      body: {
        message,
        conversationId,
        userId: action.userId
      }
    });
  }

  private async syncLike(action: OfflineAction) {
    const { videoId, isLiked } = action.payload;
    
    if (isLiked) {
      const { error } = await supabase
        .from('video_likes')
        .insert({
          video_id: videoId,
          user_id: action.userId
        });
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('video_likes')
        .delete()
        .eq('video_id', videoId)
        .eq('user_id', action.userId);
      if (error) throw error;
    }
  }

  private async syncComment(action: OfflineAction) {
    const { videoId, content } = action.payload;
    
    const { error } = await supabase
      .from('video_comments')
      .insert({
        video_id: videoId,
        user_id: action.userId,
        content
      });
    
    if (error) throw error;
  }

  private async syncFavorite(action: OfflineAction) {
    const { movieId, isFavorite } = action.payload;
    
    if (isFavorite) {
      const { error } = await supabase
        .from('user_favorites')
        .insert({
          movie_id: movieId,
          user_id: action.userId
        });
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('user_favorites')
        .delete()
        .eq('movie_id', movieId)
        .eq('user_id', action.userId);
      if (error) throw error;
    }
  }

  private updateActionStatus(actionId: string, status: OfflineAction['status']) {
    const actionIndex = this.queue.findIndex(action => action.id === actionId);
    if (actionIndex !== -1) {
      this.queue[actionIndex].status = status;
      this.saveQueue();
    }
  }

  private cleanupOldActions() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    this.queue = this.queue.filter(action => 
      action.status !== 'synced' || action.timestamp > oneHourAgo
    );
    this.saveQueue();
  }

  getPendingCount(): number {
    return this.queue.filter(action => action.status === 'pending').length;
  }

  getFailedCount(): number {
    return this.queue.filter(action => action.status === 'failed').length;
  }

  clearFailedActions() {
    this.queue = this.queue.filter(action => action.status !== 'failed');
    this.saveQueue();
  }

  retryFailedActions() {
    this.queue.forEach(action => {
      if (action.status === 'failed') {
        action.status = 'pending';
        action.retryCount = 0;
      }
    });
    this.saveQueue();
    
    if (this.isOnline) {
      this.syncPendingActions();
    }
  }

  destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }
}

// Export singleton instance
export const offlineSyncManager = OfflineSyncManager.getInstance();