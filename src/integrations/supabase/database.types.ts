import { Database as GeneratedDatabase } from './types';

export type Database = GeneratedDatabase & {
  public: {
    Tables: {
      trailer_plays: {
        Row: {
          id: string;
          user_id: string;
          movie_id: number;
          movie_title: string;
          created_at: string;
        };
      };
      search_logs: {
        Row: {
          id: string;
          user_id: string;
          query: string;
          result_count: number;
          searched_at: string;
        };
      };
      movie_opens: {
        Row: {
          id: string;
          user_id: string;
          movie_id: number;
          movie_title: string;
          opened_at: string;
        };
      };
    };
  };
};

export type Tables = Database['public']['Tables'];
export type TableName = keyof Tables;
export type TableRow<T extends TableName> = Tables[T]['Row'];

export type TMDBMovie = {
  id: number;
  title: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  media_type?: string;
  name?: string;
  first_air_date?: string;
};
