import { i18n, type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import {
  AudioLines,
  Award,
  Bed,
  Bike,
  BookOpen,
  Briefcase,
  BuildingComplex,
  Bus,
  CakeSlice,
  Calendar,
  Camera,
  Car,
  CircleQuestionMark,
  Clock,
  Coffee,
  Croissant,
  Download,
  Euro,
  FileText,
  Flag,
  Folder,
  Fuel,
  Gift,
  Globe,
  GraduationCap,
  Hammer,
  Handshake,
  HardHat,
  Heart,
  Home,
  House,
  Key,
  Layers,
  Leaf,
  Lightbulb,
  MapPin,
  Megaphone,
  Newspaper,
  Package,
  PaintRoller,
  Palette,
  Paperclip,
  PawPrint,
  Percent,
  Plane,
  Plus,
  Quote,
  Receipt,
  Scale,
  Scissors,
  Shield,
  Shirt,
  ShoppingBag,
  Star,
  Stethoscope,
  Store,
  Ticket,
  TrainFront,
  Truck,
  User,
  Users,
  Utensils,
  Video,
  Wine,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

// The icon a Collection carries: the set it is offered, and the drawing a
// stored name resolves to.
//
// Core takes any icon name Lucide ships and holds no list of them, so which
// names this app offers and which of them it can draw are its own answer. The
// set is 63 icons in 9 groups of 7, each name canonical in `lucide-react` and
// each word the everyday one for what the icon shows, so an agency setting a
// Project up picks by what a Collection holds rather than by Lucide's English
// spelling. Seven per group is what a person still reads as a list, and what
// the popup shows under one group label without scrolling.
//
// A name outside the set keeps its own drawing where this app knows it, which
// covers `home` and `plus`, the two names Core used to allow. Anything else
// falls back to the mark a Collection is drawn by, so a name a developer wrote
// through Core still looks like a Collection.
//
// See contributing/renderer/theming-and-styling.md#a-collections-icon.

/** One icon of the set: what Core stores, what it draws, what it is called. */
interface CollectionIconDefinition {
  /** Lucide's own name, which is what Core stores. */
  name: string;
  icon: LucideIcon;
  /** The everyday word for what the icon shows, read from the catalog. */
  label: MessageDescriptor;
}

/** One group of the set: its name and the icons it offers, in ci's order. */
interface CollectionIconGroupDefinition {
  label: MessageDescriptor;
  icons: CollectionIconDefinition[];
}

/* eslint-disable lingui/no-unlocalized-strings -- the `name` of each icon is
   Lucide's own, which Core stores as it is written and nobody reads as words.
   What a person reads is the `label` beside it. */

/**
 * The set, in the order the picker offers it.
 *
 * The groups follow the shape of the field types' groups: short nouns in
 * sentence case. The set holds no icon a Project's own sidebar row spends,
 * `layout-dashboard`, `images`, `blocks`, `history`, `tag` and `settings`, so a
 * Collection is never drawn by the mark of the Assets or the History.
 */
const COLLECTION_ICON_GROUPS: readonly CollectionIconGroupDefinition[] = [
  {
    label: msg`Pages and posts`,
    icons: [
      { name: 'layers', icon: Layers, label: msg`Layers` },
      { name: 'file-text', icon: FileText, label: msg`Page` },
      { name: 'newspaper', icon: Newspaper, label: msg`Newspaper` },
      { name: 'book-open', icon: BookOpen, label: msg`Book` },
      { name: 'megaphone', icon: Megaphone, label: msg`Megaphone` },
      { name: 'quote', icon: Quote, label: msg`Quote` },
      {
        name: 'circle-question-mark',
        icon: CircleQuestionMark,
        label: msg`Question mark`,
      },
    ],
  },
  {
    label: msg`Media and files`,
    icons: [
      { name: 'camera', icon: Camera, label: msg`Camera` },
      { name: 'video', icon: Video, label: msg`Video` },
      { name: 'audio-lines', icon: AudioLines, label: msg`Audio` },
      { name: 'palette', icon: Palette, label: msg`Palette` },
      { name: 'folder', icon: Folder, label: msg`Folder` },
      { name: 'paperclip', icon: Paperclip, label: msg`Paper clip` },
      { name: 'download', icon: Download, label: msg`Download` },
    ],
  },
  {
    label: msg`People and organizations`,
    icons: [
      { name: 'user', icon: User, label: msg`Person` },
      { name: 'users', icon: Users, label: msg`People` },
      { name: 'briefcase', icon: Briefcase, label: msg`Briefcase` },
      { name: 'handshake', icon: Handshake, label: msg`Handshake` },
      { name: 'building-complex', icon: BuildingComplex, label: msg`Building` },
      { name: 'store', icon: Store, label: msg`Store` },
      {
        name: 'graduation-cap',
        icon: GraduationCap,
        label: msg`Graduation cap`,
      },
    ],
  },
  {
    label: msg`Products and prices`,
    icons: [
      { name: 'package', icon: Package, label: msg`Package` },
      { name: 'shopping-bag', icon: ShoppingBag, label: msg`Shopping bag` },
      { name: 'shirt', icon: Shirt, label: msg`Shirt` },
      { name: 'gift', icon: Gift, label: msg`Gift` },
      { name: 'euro', icon: Euro, label: msg`Euro` },
      { name: 'percent', icon: Percent, label: msg`Percent` },
      { name: 'receipt', icon: Receipt, label: msg`Receipt` },
    ],
  },
  {
    label: msg`Work and tools`,
    icons: [
      { name: 'wrench', icon: Wrench, label: msg`Wrench` },
      { name: 'hammer', icon: Hammer, label: msg`Hammer` },
      { name: 'paint-roller', icon: PaintRoller, label: msg`Paint roller` },
      { name: 'hard-hat', icon: HardHat, label: msg`Hard hat` },
      { name: 'scissors', icon: Scissors, label: msg`Scissors` },
      { name: 'scale', icon: Scale, label: msg`Scales` },
      { name: 'stethoscope', icon: Stethoscope, label: msg`Stethoscope` },
    ],
  },
  {
    label: msg`Places and dates`,
    icons: [
      { name: 'map-pin', icon: MapPin, label: msg`Location` },
      { name: 'house', icon: House, label: msg`House` },
      { name: 'bed', icon: Bed, label: msg`Bed` },
      { name: 'key', icon: Key, label: msg`Key` },
      { name: 'calendar', icon: Calendar, label: msg`Calendar` },
      { name: 'clock', icon: Clock, label: msg`Clock` },
      { name: 'ticket', icon: Ticket, label: msg`Ticket` },
    ],
  },
  {
    label: msg`Food and nature`,
    icons: [
      { name: 'utensils', icon: Utensils, label: msg`Food` },
      { name: 'coffee', icon: Coffee, label: msg`Coffee` },
      { name: 'croissant', icon: Croissant, label: msg`Croissant` },
      { name: 'cake-slice', icon: CakeSlice, label: msg`Cake` },
      { name: 'wine', icon: Wine, label: msg`Wine` },
      { name: 'leaf', icon: Leaf, label: msg`Leaf` },
      { name: 'paw-print', icon: PawPrint, label: msg`Paw print` },
    ],
  },
  {
    label: msg`Vehicles and travel`,
    icons: [
      { name: 'car', icon: Car, label: msg`Car` },
      { name: 'bike', icon: Bike, label: msg`Bicycle` },
      { name: 'truck', icon: Truck, label: msg`Truck` },
      { name: 'bus', icon: Bus, label: msg`Bus` },
      { name: 'train-front', icon: TrainFront, label: msg`Train` },
      { name: 'plane', icon: Plane, label: msg`Plane` },
      { name: 'fuel', icon: Fuel, label: msg`Fuel pump` },
    ],
  },
  {
    label: msg`Marks and signs`,
    icons: [
      { name: 'star', icon: Star, label: msg`Star` },
      { name: 'heart', icon: Heart, label: msg`Heart` },
      { name: 'award', icon: Award, label: msg`Award` },
      { name: 'flag', icon: Flag, label: msg`Flag` },
      { name: 'shield', icon: Shield, label: msg`Shield` },
      { name: 'lightbulb', icon: Lightbulb, label: msg`Lightbulb` },
      { name: 'globe', icon: Globe, label: msg`Globe` },
    ],
  },
];

/**
 * The icon every Collection this app creates starts with, and the fallback.
 *
 * It is the mark the sidebar drew for every Collection before there was a
 * choice, so a Collection nobody gives an icon looks as it did, and one whose
 * stored name nothing here can draw still looks like a Collection.
 */
export const DEFAULT_COLLECTION_ICON: string = 'layers';

/**
 * The two names Core used to allow, which every Collection written before this
 * set carries. They are drawn by their own icon rather than by the fallback,
 * and the picker does not offer them.
 */
const DRAWN_BEFORE_THE_SET: readonly [string, LucideIcon][] = [
  ['home', Home],
  ['plus', Plus],
];

/* eslint-enable lingui/no-unlocalized-strings */

/** Every name this app can draw, which is the set and the two before it. */
const DRAWN_BY_NAME: ReadonlyMap<string, LucideIcon> = new Map([
  ...COLLECTION_ICON_GROUPS.flatMap((group) =>
    group.icons.map((definition): [string, LucideIcon] => [
      definition.name,
      definition.icon,
    ])
  ),
  ...DRAWN_BEFORE_THE_SET,
]);

/** The word the set offers one icon under, keyed by Lucide's name. */
const WORD_BY_NAME: ReadonlyMap<string, MessageDescriptor> = new Map(
  COLLECTION_ICON_GROUPS.flatMap((group) =>
    group.icons.map((definition): [string, MessageDescriptor] => [
      definition.name,
      definition.label,
    ])
  )
);

/**
 * What draws a Collection stored with this name.
 *
 * A `Map` rather than an object, so a stored name such as `constructor` is
 * answered by the fallback instead of by something on `Object.prototype`.
 */
export function collectionIcon(name: string): LucideIcon {
  return DRAWN_BY_NAME.get(name) ?? Layers;
}

/**
 * What a person reads this icon as: its word from the set, or the stored name
 * itself where the set does not hold it, so a name a developer set through Core
 * is shown as what it is rather than as another icon's word.
 */
export function collectionIconWord(name: string): string {
  const word = WORD_BY_NAME.get(name);

  return word === undefined ? name : i18n._(word);
}

/** One icon as the picker offers it. */
export interface CollectionIconOption {
  /** Lucide's name, which is what choosing this one stores. */
  name: string;
  icon: LucideIcon;
  /** The word it is offered and found under. */
  label: string;
  /** Its group's name, which the filter matches as well. */
  group: string;
}

/** One group as the picker offers it. */
export interface CollectionIconGroupOption {
  label: string;
  items: CollectionIconOption[];
}

/**
 * The set as the picker offers it, with every word read from the catalog as it
 * is asked for, so the language somebody switches to reaches the next draw.
 */
export function collectionIconGroups(): CollectionIconGroupOption[] {
  return COLLECTION_ICON_GROUPS.map((group) => {
    const label = i18n._(group.label);

    return {
      label,
      items: group.icons.map((definition) => ({
        name: definition.name,
        icon: definition.icon,
        label: i18n._(definition.label),
        group: label,
      })),
    };
  });
}
