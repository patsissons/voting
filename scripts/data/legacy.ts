// What cubby.fyi kept outside the election JSON: the party colours lived in
// pb_public/voting/style.css (light and dark), and the row columns in
// migrations. The transform folds them into the election documents.

export const LEGACY_COLORS: Record<string, { light: string; dark: string }> = {
  abc: { light: '#2a78d6', dark: '#3a7bd0' },
  green: { light: '#008300', dark: '#008300' },
  onecity: { light: '#4a3aa7', dark: '#9b7bea' },
  cope: { light: '#e34948', dark: '#e66767' },
  team: { light: '#c13fae', dark: '#b84db0' },
  lib: { light: '#eda100', dark: '#c98500' },
  vv: { light: '#1baf7a', dark: '#14a3b8' },
  ndp: { light: '#e4601a', dark: '#f07a3a' },
  cp: { light: '#1d55c4', dark: '#5b8ded' },
  centre: { light: '#0e8a8a', dark: '#2fb3b3' },
  onebc: { light: '#8d1f5a', dark: '#d05a95' },
}

/** The cubby `voting_elections` rows as seeded by its migrations, for a transform without a live export. */
export const LEGACY_ROWS = [
  {
    slug: 'vancouver-2026',
    title: 'Vancouver Votes 2026',
    description:
      'Thirteen questions on the issues that divide Vancouver’s seven main parties, scored against their platforms, with your matching ballot numbers and live election-night results.',
    voting_day: '2026-10-17 12:00:00.000Z',
    published: true,
  },
  {
    slug: 'bc-2026',
    title: 'BC Votes 2026',
    description:
      'Fifteen questions on where the five main parties differ in the snap provincial election, scored against their platforms, with the candidates in your riding and live election-night results for all 93 ridings.',
    voting_day: '2026-10-24 12:00:00.000Z',
    published: true,
  },
  {
    slug: 'alberta-2026',
    title: 'Alberta Votes 2026',
    description:
      "The ten referendum questions, from separation to immigration and the Constitution, in their official wording with polls and plain context. Mark your own ballot and compare it with Alberta's live count.",
    voting_day: '2026-10-19 12:00:00.000Z',
    published: true,
  },
]
