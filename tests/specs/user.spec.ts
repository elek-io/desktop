import { expect, type Locator, type Page } from '@playwright/test';

import { test as cloudTest } from '../fixtures/cloudStub.js';
import { test as appTest } from '../fixtures/electronApp.js';
import {
  recordedCoreCalls,
  stubCoreRecord,
  stubCoreRejectWithType,
} from '../helpers/ipc.js';
import {
  bootOnHash,
  navigate,
  verifyCurrentRouteHash,
} from '../helpers/navigation.js';
import { createProjectViaIpc } from '../helpers/project.js';
import {
  closeReportDialog,
  openReportDialogFromHeader,
} from '../helpers/report.js';
import { setTheme } from '../helpers/theme.js';
import {
  completeFirstStart,
  navigateToFirstStart,
  navigateToUserProfile,
  setUserViaIpc,
} from '../helpers/user.js';

/** What keeps a form from saving, as it stands below its one button. */
function blockedReason(page: Page): Locator {
  return page.locator('[data-slot="form-blocked-reason"]');
}

appTest.describe('The first start', () => {
  appTest(
    'stands in front of every screen until a User exists, and nowhere after',
    async ({ mainWindow }) => {
      // Core stamps the name and the email address on every change it commits,
      // so nothing can be written before a User exists and no other screen is
      // reachable.
      await verifyCurrentRouteHash(mainWindow, '#/welcome');
      await expect(
        mainWindow.getByRole('heading', { name: 'Welcome to elek.io Desktop' })
      ).toBeVisible();

      // Every other address settles here too, however it is reached.
      await navigate(mainWindow, '#/welcome');
      await expect(
        mainWindow.getByRole('heading', { name: 'Welcome to elek.io Desktop' })
      ).toBeVisible();

      // Continuing writes the User and opens the Projects page, and the first
      // start is then gone: its own address settles on the Projects page.
      await completeFirstStart(mainWindow, {
        name: 'Ada Lovelace',
        email: 'ada@elek.io',
      });
      await expect(
        mainWindow.getByText('Create your first Project')
      ).toBeVisible();
      await bootOnHash(mainWindow, '#/welcome', '#/projects');

      // The User persisted, which the Profile reads back from Core on a fresh
      // boot.
      await navigateToUserProfile(mainWindow);
      await expect(mainWindow.getByLabel('Full name')).toHaveValue(
        'Ada Lovelace'
      );
    }
  );

  appTest(
    'stands as one card on the gradient with both fields marked Required',
    async ({ mainWindow }) => {
      await navigateToFirstStart(mainWindow);

      // One card of 360 px on the gradient, which carries the dark mode colors
      // in both modes, while the card takes the light ones back in light mode.
      const onTheGradient = async (): Promise<{
        gradient: string;
        isDark: boolean;
        cardWidth: number;
        surfaceColor: string;
        cardColor: string;
      }> =>
        mainWindow.evaluate(() => {
          const surface = document.querySelector('[data-slot="gradient-pane"]');
          const card = document.querySelector('.on-plate');

          if (surface === null || card === null) {
            throw new Error('The first start has no card on the gradient');
          }

          return {
            gradient: getComputedStyle(surface).backgroundImage,
            isDark: surface.classList.contains('dark'),
            cardWidth: Math.round(card.getBoundingClientRect().width),
            surfaceColor: getComputedStyle(surface).color,
            cardColor: getComputedStyle(card).color,
          };
        });

      await setTheme(mainWindow, 'light');
      const inLight = await onTheGradient();
      expect(inLight.gradient).toContain('linear-gradient');
      expect(inLight.isDark).toBe(true);
      expect(inLight.cardWidth).toBe(360);
      // The card declares the light colors again, so in light mode its text is
      // not the near-white the gradient around it carries.
      expect(inLight.cardColor).not.toBe(inLight.surfaceColor);

      // In dark mode there is nothing to take back, so both are the same.
      await setTheme(mainWindow, 'dark');
      const inDark = await onTheGradient();
      expect(inDark.cardColor).toBe(inDark.surfaceColor);
      await setTheme(mainWindow, 'light');

      // Both fields say what they need before anybody presses Continue.
      await expect(
        mainWindow.getByLabel('Name', { exact: true })
      ).toHaveAttribute('aria-required', 'true');
      await expect(
        mainWindow.getByLabel('Email address', { exact: true })
      ).toHaveAttribute('aria-required', 'true');
      await expect(
        mainWindow.getByRole('button', { name: 'Continue' })
      ).toBeVisible();
    }
  );

  appTest(
    'holds Continue with its reason while a field is empty, and writes nothing',
    async ({ electronApp, mainWindow }) => {
      await navigateToFirstStart(mainWindow);
      const continueButton = mainWindow.getByRole('button', {
        name: 'Continue',
      });

      // Both fields are empty on open, so Continue says what is missing and
      // stays reachable rather than leaving the tab order.
      await expect(blockedReason(mainWindow)).toHaveText(
        '2 fields are still empty'
      );
      await expect(continueButton).toBeDisabled();
      await expect(continueButton).toHaveAttribute('aria-describedby', /.+/);

      await mainWindow.getByLabel('Name', { exact: true }).fill('Ada Lovelace');
      await expect(blockedReason(mainWindow)).toHaveText(
        '1 field is still empty'
      );

      // Nothing reaches Core while it is blocked, however the submit is
      // raised: the channel in front of Core is the seam this records.
      await stubCoreRecord(electronApp, 'core:user:set');
      // A click, which the control still takes, since it is not `disabled`.
      await continueButton.click({ force: true });
      await mainWindow
        .getByLabel('Name', { exact: true })
        .press('Enter', { noWaitAfter: true });
      expect(await recordedCoreCalls(electronApp)).toEqual([]);
      await verifyCurrentRouteHash(mainWindow, '#/welcome');

      // Filling the second one clears the reason and frees the button.
      await mainWindow
        .getByLabel('Email address', { exact: true })
        .fill('ada@elek.io');
      await expect(blockedReason(mainWindow)).toBeHidden();
      await expect(continueButton).toBeEnabled();
    }
  );

  appTest(
    'holds the mark still under reduced motion, since the period is simply in place',
    async ({ mainWindow }) => {
      await navigateToFirstStart(mainWindow);

      // The mark's one motion is its cyan period arriving, which is the last
      // path of the brand package's own file.
      const period = mainWindow
        .locator('[data-slot="brand-mark"]:visible > svg > path:last-child')
        .first();
      await expect(period).toBeAttached();

      const moving = await period.evaluate(
        (node) => getComputedStyle(node).animationName
      );
      expect(moving).toBe('brand-mark-period');

      await mainWindow.emulateMedia({ reducedMotion: 'reduce' });
      const still = await period.evaluate(
        (node) => getComputedStyle(node).animationName
      );
      expect(still).toBe('none');
      await mainWindow.emulateMedia({ reducedMotion: null });
    }
  );

  appTest(
    'reaches the root error screen when Core cannot be asked whether a User exists',
    async ({ electronApp, mainWindow }) => {
      // The gate reads the User before any screen is drawn, so a read it cannot
      // make reaches the root error screen, which is where a read above every
      // pane ends up either way.
      await stubCoreRejectWithType(electronApp, 'core:user:get', 'Internal');
      await mainWindow.reload();

      await expect(
        mainWindow.getByRole('heading', { name: 'Error' })
      ).toBeVisible();
      await expect(
        mainWindow.getByRole('heading', { name: 'Welcome to elek.io Desktop' })
      ).toBeHidden();
    }
  );

  appTest(
    'reaches the root error screen when Core refuses to write the User',
    async ({ electronApp, mainWindow }) => {
      // The create form handles no type, so a refused write is unexpected and
      // belongs on the error screen rather than in the card.
      await navigateToFirstStart(mainWindow);
      await stubCoreRejectWithType(electronApp, 'core:user:set', 'BadRequest');
      await mainWindow.getByLabel('Name', { exact: true }).fill('Ada Lovelace');
      await mainWindow
        .getByLabel('Email address', { exact: true })
        .fill('ada@elek.io');
      await mainWindow.getByRole('button', { name: 'Continue' }).click();

      await expect(
        mainWindow.getByRole('heading', { name: 'Error' })
      ).toBeVisible();
    }
  );
});

cloudTest.describe(
  'What the first start says about the name and the email address',
  () => {
    cloudTest(
      'is true of the build: nothing sends them until somebody presses Send',
      async ({ mainWindow, cloudStub }) => {
        await navigateToFirstStart(mainWindow);

        // The note on the card, which is the claim this test holds to the build.
        await expect(
          mainWindow.getByText(
            'Desktop sends them nowhere else without asking.',
            { exact: false }
          )
        ).toBeVisible();

        await completeFirstStart(mainWindow, {
          name: 'Mara Klein',
          email: 'mara@autohaus-ebersfelde.de',
        });

        // Working in the app sends nothing at all. The stub stands where
        // api.elek.io does, so anything that left would be in here.
        await createProjectViaIpc(mainWindow);
        await navigate(mainWindow, '#/projects');
        await expect(mainWindow.getByText('Test Project')).toBeVisible();
        expect(cloudStub.reports).toHaveLength(0);

        // The one place that sends them fills them in, so somebody sees what
        // would go and can change or clear it, and it waits for Send. That it
        // sends what is in the fields is report-delivery.spec.ts.
        const dialog = await openReportDialogFromHeader(mainWindow);
        await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue(
          'Mara Klein'
        );
        await expect(dialog.getByLabel('Email', { exact: true })).toHaveValue(
          'mara@autohaus-ebersfelde.de'
        );
        await closeReportDialog(mainWindow);
        expect(cloudStub.reports).toHaveLength(0);
      }
    );
  }
);

appTest.describe('User profile', () => {
  appTest(
    'edits an existing User and persists the change',
    async ({ mainWindow }) => {
      await setUserViaIpc(mainWindow, {
        name: 'Test User',
        email: 'test@elek.io',
      });
      await navigateToUserProfile(mainWindow);

      // With a User already set, the form reset from it (no Welcome title), shows
      // the existing name, and Save is gated until an edit dirties the form.
      await expect(
        mainWindow.getByRole('heading', { name: 'User profile' })
      ).toBeVisible();
      await expect(mainWindow.getByLabel('Full name')).toHaveValue('Test User');
      await expect(
        mainWindow.getByRole('button', { name: 'Save local User' })
      ).toBeDisabled();

      // Editing the name dirties the form, so Save enables. Saving navigates to
      // the Projects list. Whether the new identity reaches the git author is
      // Core's own test, so it is not asserted here.
      await mainWindow.getByLabel('Full name').fill('Renamed User');
      await expect(
        mainWindow.getByRole('button', { name: 'Save local User' })
      ).toBeEnabled();
      await mainWindow.getByRole('button', { name: 'Save local User' }).click();
      await expect(mainWindow).toHaveURL(/#\/projects$/);

      // Persistence: reopening the profile shows the renamed value.
      await navigateToUserProfile(mainWindow);
      await expect(mainWindow.getByLabel('Full name')).toHaveValue(
        'Renamed User'
      );
    }
  );
});
