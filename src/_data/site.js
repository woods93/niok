// Site-wide settings. Edit the values below, then commit the change.
export default {
  title: 'The Nashville I Once Knew',
  tagline: 'News about Nashville and Nashville music, with an eye for the stories that look back.',
  description:
    'Nashville and Nashville music news from many sources, with a focus on stories that look back at the 1980s and early 1990s scene.',
  // Email shown on the About page for corrections and takedown requests. Leave empty to hide the line.
  contact: '',
  // Link to the podcast (website or podcast app page). Leave empty to hide the link.
  podcastUrl: '',
  podcastName: 'The Nashville I Once Knew podcast',
  // Set by the workflow from the SITE_URL variable. Used for the RSS feed.
  url: (process.env.SITE_URL || 'http://localhost:8080').replace(/\/$/, '')
};
