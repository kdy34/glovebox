// T103b — header titles (i18n keys) for every stack route. iOS also uses a screen's title as the
// back label of the next screen, so every route needs one; otherwise the raw route name
// ("vehicle/new", "(tabs)") is shown. Pure data so it can be unit-tested.
//
// Screens whose title depends on data set it at runtime with <Stack.Screen options={{ title }} />
// (vehicle/[id]: the vehicle's name; legal/[doc]: the document); the key here is the fallback.
export const STACK_TITLES = {
  onboarding: 'nav.welcome',
  '(auth)/sign-in': 'nav.signIn',
  'vehicle/new': 'vehicle.addTitle',
  'vehicle/[id]/index': 'nav.vehicle',
  'vehicle/[id]/edit': 'vehicle.editTitle',
  'vehicle/[id]/rules': 'nav.rules',
  'record/new': 'record.newTitle',
  'record/[id]': 'record.editTitle',
  'odometer/new': 'odometer.newTitle',
  'scan/index': 'nav.scan',
  'scan/review': 'nav.scanReview',
  'legal/[doc]': 'nav.legal',
} as const;

/** Title of the (tabs) stack entry, by focused tab — the back label for screens pushed from a tab. */
export const TAB_TITLES = {
  index: 'tabs.garage',
  reminders: 'tabs.reminders',
  insights: 'tabs.insights',
  settings: 'tabs.settings',
} as const;

export type TabRoute = keyof typeof TAB_TITLES;

export function tabTitleKey(focused: string | undefined): (typeof TAB_TITLES)[TabRoute] {
  return TAB_TITLES[(focused ?? 'index') as TabRoute] ?? TAB_TITLES.index;
}
