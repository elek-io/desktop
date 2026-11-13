import { expect, test } from '@playwright/test';

import { supportedLanguageSchema } from '@elek-io/core';

import { languagesWithErrors } from '../../src/renderer/lib/formErrors.js';

/**
 * Which of a Project's languages hold a refused Value, which needs no window.
 *
 * It is what marks a language in the switch above an Entry's fields, so an
 * error in a language nobody is looking at is still visible. A refusal lands at
 * the path the Value is bound to, so the language is a segment of that path,
 * and the shapes it can arrive in are driven here. That a refused save marks
 * the language in the switch is what the Entry spec drives, in the app.
 */
test.describe('The languages a form holds a refusal in', () => {
  const languages = ['en', 'de'] as const;

  test('reads the language off the path a refusal landed at', () => {
    // One field of the Entry, refused in the language that is not on screen.
    expect([
      ...languagesWithErrors(
        { values: { title: { content: { de: { message: 'Too short' } } } } },
        languages
      ),
    ]).toEqual(['de']);

    // A field inside a section of a dynamic field, whose path runs through the
    // list and the Component's own slug before it ends at the language.
    expect([
      ...languagesWithErrors(
        {
          values: {
            sections: {
              content: {
                0: {
                  values: {
                    headline: { content: { de: { message: 'Too short' } } },
                  },
                },
              },
            },
          },
        },
        languages
      ),
    ]).toEqual(['de']);

    // Every language that holds one, rather than the first.
    expect([
      ...languagesWithErrors(
        {
          values: {
            title: {
              content: {
                en: { message: 'Too short' },
                de: { message: 'Too short' },
              },
            },
          },
        },
        languages
      ),
    ]).toEqual(['en', 'de']);
  });

  test('marks no language where a refusal belongs to none', () => {
    // A form with nothing wrong.
    expect([...languagesWithErrors({}, languages)]).toEqual([]);
    expect([...languagesWithErrors(undefined, languages)]).toEqual([]);

    // A refusal of the whole Value rather than of one language, which is what
    // a Value that is not a per-language record at all reports.
    expect([
      ...languagesWithErrors(
        { values: { title: { content: { message: 'Expected object' } } } },
        languages
      ),
    ]).toEqual([]);

    // A language the Project does not support, which the switch has no segment
    // for either.
    expect([
      ...languagesWithErrors(
        { values: { title: { content: { fr: { message: 'Too short' } } } } },
        languages
      ),
    ]).toEqual([]);
  });

  test('answers for every language Core supports', () => {
    // Each of them, one at a time, so a language Core adds is answered for
    // here rather than being left to the two the cases above drive.
    for (const language of supportedLanguageSchema.options) {
      expect([
        ...languagesWithErrors(
          {
            values: {
              title: { content: { [language]: { message: 'Too short' } } },
            },
          },
          supportedLanguageSchema.options
        ),
      ]).toEqual([language]);
    }
  });
});
