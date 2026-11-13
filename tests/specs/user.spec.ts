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
      await expect(mainWindow.getByLabel('Name', { exact: true })).toHaveValue(
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

appTest.describe('The Profile', () => {
  appTest(
    'edits an existing User and persists the change',
    async ({ mainWindow }) => {
      await setUserViaIpc(mainWindow, {
        name: 'Test User',
        email: 'test@elek.io',
      });
      await navigateToUserProfile(mainWindow);
      const name = mainWindow.getByLabel('Name', { exact: true });
      const save = mainWindow.getByRole('button', { name: 'Save' });

      // With a User already set, the form filled from it, shows the existing
      // name, and Save is gated until an edit dirties the form.
      await expect(
        mainWindow.getByRole('heading', { name: 'Profile' })
      ).toBeVisible();
      await expect(name).toHaveValue('Test User');
      await expect(save).toBeDisabled();

      // Editing the name dirties the form, so Save enables. Whether the new
      // identity reaches the git author is Core's own test, so it is not
      // asserted here.
      await name.fill('Renamed User');
      await expect(save).toBeEnabled();
      await save.click();

      // The page stays open and is pristine again with what went in, as every
      // other settings page is.
      await expect(mainWindow.getByText('Profile saved')).toBeVisible();
      await expect(mainWindow).toHaveURL(/#\/user\/profile$/);
      await expect(save).toBeDisabled();

      // Persistence: reopening the profile shows the renamed value.
      await navigateToUserProfile(mainWindow);
      await expect(mainWindow.getByLabel('Name', { exact: true })).toHaveValue(
        'Renamed User'
      );
    }
  );

  appTest(
    "is ci's 360 px form, with the first start's note and the Local API's port and address",
    async ({ mainWindow }) => {
      await setUserViaIpc(mainWindow, {
        name: 'Mara Klein',
        email: 'mara@autohaus-ebersfelde.de',
        localApi: { port: 31310, isEnabled: false },
      });
      await navigateToUserProfile(mainWindow);

      // The form is 360 px wide, like the sign in pages ci draws it after.
      const width = await mainWindow
        .locator('form')
        .evaluate((form) => Math.round(form.getBoundingClientRect().width));
      expect(width).toBe(360);

      // Both fields say what they need before anybody presses Save.
      for (const label of ['Name', 'Email address'] as const) {
        await expect(
          mainWindow.getByLabel(label, { exact: true })
        ).toHaveAttribute('aria-required', 'true');
      }

      // The same note the first start shows, in place of the line that said
      // the name and the address are only saved locally.
      await expect(
        mainWindow.getByText(
          'Your name and email address mark your changes in the History.',
          { exact: false }
        )
      ).toBeVisible();
      await expect(mainWindow.getByText('only saved locally')).toBeHidden();

      // The Local API's port, and the address other apps read it at, which
      // follows the field while it is typed.
      await expect(
        mainWindow.getByRole('heading', { name: 'Local API' })
      ).toBeVisible();
      const port = mainWindow.getByLabel('Port', { exact: true });
      await expect(port).toHaveValue('31310');
      await expect(
        mainWindow.getByText('http://localhost:31310')
      ).toBeVisible();
      await port.fill('31400');
      await expect(
        mainWindow.getByText('http://localhost:31400')
      ).toBeVisible();

      // The language and the switch that turns the Local API on are in the
      // user menu, so neither is on this page.
      await expect(mainWindow.getByRole('switch')).toBeHidden();
      await expect(mainWindow.getByLabel('Preferred language')).toBeHidden();
    }
  );

  appTest(
    'holds Save with its reason while a field is empty, and writes nothing',
    async ({ electronApp, mainWindow }) => {
      await setUserViaIpc(mainWindow, {
        name: 'Mara Klein',
        email: 'mara@autohaus-ebersfelde.de',
        localApi: { port: 31310, isEnabled: false },
      });
      await navigateToUserProfile(mainWindow);
      const name = mainWindow.getByLabel('Name', { exact: true });
      const port = mainWindow.getByLabel('Port', { exact: true });
      const save = mainWindow.getByRole('button', { name: 'Save' });
      await expect(name).toHaveValue('Mara Klein');

      // Emptying the Name says what is missing before anybody presses Save,
      // and Save stays reachable rather than leaving the tab order.
      await name.fill('');
      await expect(blockedReason(mainWindow)).toHaveText(
        '1 field is still empty'
      );
      await expect(save).toBeDisabled();
      await expect(save).toHaveAttribute('aria-describedby', /.+/);

      // The Local API's port counts the same way, since it has to have one to
      // listen on.
      await port.fill('');
      await expect(blockedReason(mainWindow)).toHaveText(
        '2 fields are still empty'
      );

      // Nothing reaches Core while it is blocked, however the submit is
      // raised, and the validator does not even run, so no field is flagged.
      await stubCoreRecord(electronApp, 'core:user:set');
      await save.click({ force: true });
      await name.press('Enter', { noWaitAfter: true });
      expect(await recordedCoreCalls(electronApp)).toEqual([]);
      await expect(name).toHaveAttribute('aria-invalid', 'false');
      await verifyCurrentRouteHash(mainWindow, '#/user/profile');

      // Filling both clears the reason and frees the button. The name goes
      // back in changed, because a form filled back to what it held is
      // pristine, and the dirty gate blocks Save then without words.
      await name.fill('Mara Weber');
      await port.fill('31310');
      await expect(blockedReason(mainWindow)).toBeHidden();
      await expect(save).toBeEnabled();
    }
  );
});

appTest.describe('The user menu', () => {
  appTest(
    'holds Profile, Local API, Theme and Language, each language in its own words',
    async ({ mainWindow }) => {
      await setUserViaIpc(mainWindow, { name: 'Mara Klein' });
      await navigate(mainWindow, '#/projects');
      await mainWindow.getByRole('button', { name: /Mara Klein/ }).click();
      const menu = mainWindow.getByRole('menu').first();
      await expect(menu).toBeVisible();

      // ci's four rows, in ci's order, each 32 px high in a menu of 280 px.
      await expect(
        menu.getByRole('menuitem', { name: 'Profile' })
      ).toBeVisible();
      await expect(menu.getByText('Local API')).toBeVisible();
      await expect(menu.getByRole('menuitem', { name: 'Theme' })).toBeVisible();
      const language = menu.getByRole('menuitem', { name: 'Language' });
      await expect(language).toBeVisible();

      // Polled, because the menu scales as it opens, so a width read in the
      // middle of that is neither the one it starts at nor the one it ends on.
      await expect
        .poll(async () =>
          menu.evaluate((node) =>
            Math.round(node.getBoundingClientRect().width)
          )
        )
        .toBe(280);

      const measured = await mainWindow.evaluate(() => {
        const node = document.querySelector(
          '[data-slot="dropdown-menu-content"]'
        );

        if (node === null) {
          throw new Error('The user menu is not open');
        }

        return {
          width: Math.round(node.getBoundingClientRect().width),
          rows: Array.from(
            node.querySelectorAll(
              '[data-slot="dropdown-menu-item"],[data-slot="dropdown-menu-sub-trigger"],[data-slot="dropdown-menu-row"]'
            )
          ).map((row) => Math.round(row.getBoundingClientRect().height)),
        };
      });
      expect(measured.width).toBe(280);
      // Every row ci draws is 32 px high, Local API's own row included, which
      // is a row of the menu rather than one of its items so the switch stays
      // in the accessibility tree.
      expect(measured.rows.length).toBeGreaterThanOrEqual(4);
      expect(new Set(measured.rows)).toEqual(new Set([32]));

      // The row says which language the app is read in, and its submenu lists
      // every language Desktop has words for, each named in its own language.
      await expect(language).toContainText('English');
      await language.click();
      const languages = mainWindow
        .getByRole('menu')
        .filter({ has: mainWindow.getByRole('menuitemradio') });
      await expect(
        languages.getByRole('menuitemradio', { name: 'English' })
      ).toBeChecked();
      // Core knows 24 languages, and Desktop offers only the ones it can
      // speak, so nothing it has no words for is in the list.
      await expect(languages.getByRole('menuitemradio')).toHaveCount(1);
      await expect(
        languages.getByRole('menuitemradio', { name: 'de' })
      ).toBeHidden();
    }
  );
});
