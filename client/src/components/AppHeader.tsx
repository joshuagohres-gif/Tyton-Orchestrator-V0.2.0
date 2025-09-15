import { useState } from "react";
import { Link } from "wouter";
import { Microchip, Home, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface AppHeaderProps {
  children?: React.ReactNode;
}

export default function AppHeader({ children }: AppHeaderProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  return (
    <header className="bg-card border-b border-border px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3 relative">
          <Button 
            variant="ghost" 
            className="flex items-center space-x-3 hover:bg-secondary/50 p-2 rounded-lg"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            data-testid="dropdown-logo-trigger"
          >
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Microchip className="w-6 h-6 text-primary-foreground" />
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-bold text-foreground">Tyton Orchestrator</h1>
              <p className="text-sm text-muted-foreground">AI-Powered Hardware Design Platform</p>
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </Button>
          
          {isDropdownOpen && (
            <Card className="absolute top-full left-0 mt-1 w-48 z-50 bg-popover border shadow-md">
              <div className="p-1">
                <Link 
                  href="/" 
                  className="flex items-center w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => setIsDropdownOpen(false)}
                  data-testid="menu-item-home"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Home
                </Link>
              </div>
            </Card>
          )}
        </div>
        
        {children}
      </div>
    </header>
  );
}