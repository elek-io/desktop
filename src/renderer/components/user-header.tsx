import { Link, useRouter } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { Fragment } from 'react/jsx-runtime';

import { ReportDialog } from '@renderer/components/report-dialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@renderer/components/ui/breadcrumb';
import { Button } from '@renderer/components/ui/button';
import { ButtonGroup } from '@renderer/components/ui/button-group';
import {
  UserDropdown,
  UserDropdownSkeleton,
} from '@renderer/components/user-dropdown';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useUser } from '@renderer/hooks/useUser';

export function UserHeader(): React.JSX.Element {
  const router = useRouter();
  const {
    userQuery: { data: user, isPending: isGettingUser },
  } = useUser();
  const { breadcrumbs } = useBreadcrumb();
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);

  return (
    <div className="flex w-full border-b bg-sidebar">
      <div className="flex w-60 shrink-0 border-r p-2" />
      <div className="flex flex-1 items-center p-1">
        <div className="flex flex-1 items-center">
          <ButtonGroup>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.history.back()}
              Icon={ArrowLeft}
            >
              <span className="sr-only">Go back</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.history.forward()}
              Icon={ArrowRight}
            >
              <span className="sr-only">Go forward</span>
            </Button>
          </ButtonGroup>

          <Breadcrumb className="ml-4 flex flex-1">
            <BreadcrumbList>
              {breadcrumbs.map((crumb, index, array) => (
                <Fragment key={crumb.path}>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link to={crumb.path}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  {array.length !== index + 1 && <BreadcrumbSeparator />}
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        {/*
          Deliberately outside the user check: reporting a problem must not
          depend on having finished onboarding, since a broken first run is
          exactly the thing worth reporting.
        */}
        <Button
          variant="ghost"
          size="sm"
          className="mr-2"
          onClick={() => setIsReportDialogOpen(true)}
          Icon={MessageSquare}
        >
          Feedback
        </Button>

        {isGettingUser ? (
          <UserDropdownSkeleton />
        ) : user === null ? null : (
          <UserDropdown user={user} />
        )}
      </div>

      <ReportDialog
        open={isReportDialogOpen}
        onOpenChange={setIsReportDialogOpen}
      />
    </div>
  );
}
