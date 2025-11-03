import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home, AlertCircle } from "lucide-react";
import { Button } from "../components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center animate-fade-in">
        <AlertCircle className="mx-auto mb-6 text-primary" size={64} />
        <h1 className="mb-4 text-6xl font-bold font-poppins">404</h1>
        <p className="mb-6 text-xl text-muted-foreground max-w-md">
          Oops! This page seems to have gone missing from our cinema
        </p>
        <Link to="/">
          <Button className="btn-cinema">
            <Home className="mr-2" size={20} />
            Back to Home
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
