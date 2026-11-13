import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { Button, EmptyState } from '@/src/components/ui';

export function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <EmptyState
        icon={<FileText className="h-5 w-5" />}
        title="Page not found"
        description="The workspace or landing route you requested does not exist."
        action={
          <div className="flex gap-2">
            <Link to="/">
              <Button size="sm" variant="outline">
                Public Home
              </Button>
            </Link>
            <Link to="/app">
              <Button size="sm">Open Workspace</Button>
            </Link>
          </div>
        }
      />
    </div>
  );
}
