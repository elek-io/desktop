import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { TriangleAlertIcon } from 'lucide-react';
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@renderer/components/ui/toggle-group';
import { languageName } from '@renderer/lib/utils';

import type { SupportedLanguage } from '@elek-io/core';

// The switch above a form's fields that takes the whole page into another
// language, and marks each language that misses a required Value or holds a
// refused one.
//
// See contributing/renderer/internationalization.md#one-language-at-a-time.

/** What one language of the switch says about itself. */
export interface LanguageState {
  language: SupportedLanguage;
  /** How many required Values this language is still missing. */
  missing: number;
  /** Whether a Value of this language was refused. */
  hasError: boolean;
}

export interface LanguageSwitchProps {
  languages: LanguageState[];
  /** The language on screen, which is the one segment that reads as pressed. */
  language: SupportedLanguage;
  onLanguageChange: (language: SupportedLanguage) => void;
}

/** The catalog's `t`, as a component reads it through `useLingui`. */
type Translate = ReturnType<typeof useLingui>['t'];

/** Whether a language has something somebody has to go and look at. */
function needsAttention(state: LanguageState): boolean {
  return state.missing > 0 || state.hasError;
}

/**
 * What a screen reader hears for one language: its word, and what it is
 * missing.
 *
 * The visible part of a segment is the language's code, which is what fits
 * beside the others, so its word is said as well rather than instead, which is
 * what WCAG 2.5.3 asks of a name that carries more than its label.
 */
function languageText(state: LanguageState, t: Translate): string {
  const name = languageName(state.language);

  if (state.missing > 0) {
    return t`${name}, missing ${plural(state.missing, {
      one: '# Value',
      other: '# Values',
    })}`;
  }
  if (state.hasError) {
    return t`${name}, with a Value that was refused`;
  }
  return name;
}

/** The warning mark a language with something missing carries, as ci draws it. */
function AttentionMark(): ReactElement {
  return (
    <TriangleAlertIcon aria-hidden className="size-3 shrink-0 text-warning" />
  );
}

/**
 * The switch as ci draws it: one segment per language, side by side.
 *
 * Only one language is ever on screen, so the segments are a group where one is
 * pressed, which is how ci draws a chosen segment and a pressed button alike. A
 * press on the language already shown changes nothing rather than leaving the
 * form with no language at all.
 */
function LanguageSegments({
  languages,
  language,
  onLanguageChange,
}: LanguageSwitchProps): ReactElement {
  const { t } = useLingui();

  return (
    <ToggleGroup
      aria-label={t`Language`}
      value={[language]}
      onValueChange={(pressed) => {
        const next = languages.find(
          (state) => state.language === pressed[0]
        )?.language;
        if (next !== undefined && next !== language) {
          onLanguageChange(next);
        }
      }}
      spacing={0.5}
      className="rounded-md border p-0.5"
    >
      {languages.map((state) => (
        <ToggleGroupItem key={state.language} value={state.language} size="xs">
          {state.language.toUpperCase()}
          {needsAttention(state) ? <AttentionMark /> : null}
          <span className="sr-only">{languageText(state, t)}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * The same switch as one dropdown, for a Project with more languages than its
 * row holds.
 *
 * Each language keeps the mark it carries in the row, on its option and on the
 * closed trigger, so what is missing is visible without opening it.
 */
function LanguageDropdown({
  languages,
  language,
  onLanguageChange,
}: LanguageSwitchProps): ReactElement {
  const { t } = useLingui();
  const chosen = languages.find((state) => state.language === language);
  const items = Object.fromEntries(
    languages.map((state) => [state.language, languageName(state.language)])
  );

  return (
    <Select
      items={items}
      value={language}
      onValueChange={(picked) => {
        const next = languages.find(
          (state) => state.language === picked
        )?.language;
        if (next !== undefined && next !== language) {
          onLanguageChange(next);
        }
      }}
    >
      <SelectTrigger size="sm" aria-label={t`Language`} className="min-w-0">
        <SelectValue />
        {chosen !== undefined && needsAttention(chosen) ? (
          <AttentionMark />
        ) : null}
      </SelectTrigger>
      <SelectContent>
        {languages.map((state) => (
          <SelectItem key={state.language} value={state.language}>
            {languageName(state.language)}
            {needsAttention(state) ? <AttentionMark /> : null}
            <span className="sr-only">{languageText(state, t)}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * One switch for the language of a whole page.
 *
 * It shows the Project's languages side by side while they fit, and otherwise
 * as one dropdown, which Nils decided on 2026-11-01 because Core supports 27
 * languages while the editor is 318 px wide at the smallest window the app
 * supports.
 * Which of the two is on screen comes from measuring the row against the room
 * it has rather than from a number of languages written out here, so a wider
 * window shows more of them side by side.
 */
export function LanguageSwitch(props: LanguageSwitchProps): ReactElement {
  const room = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  // What the row needs, once it has been measured. It is remembered, because
  // the row is no longer there to measure once the dropdown took its place.
  const needed = useRef<number | null>(null);
  const [fits, setFits] = useState(true);

  const measure = useCallback((): void => {
    if (room.current === null) {
      return;
    }
    if (row.current !== null) {
      needed.current = row.current.scrollWidth;
    }
    if (needed.current === null) {
      return;
    }
    setFits(room.current.clientWidth >= needed.current);
  }, []);

  useLayoutEffect(() => {
    const observed = room.current;
    if (observed === null) {
      return undefined;
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(observed);

    return () => observer.disconnect();
  }, [measure, props.languages.length]);

  return (
    <div
      data-slot="language-switch"
      className="flex min-w-0 flex-1 overflow-hidden"
    >
      <div ref={room} className="min-w-0 flex-1">
        {/* The row never shrinks, so its own width is what says whether it
        fits in the room the switch has. */}
        <div ref={row} className="w-max">
          {fits ? <LanguageSegments {...props} /> : null}
        </div>
        {fits ? null : <LanguageDropdown {...props} />}
      </div>
    </div>
  );
}
