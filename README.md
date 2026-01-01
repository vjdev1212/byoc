# BYOC
BYOC - Bring your own content, a simple and sleek frontend for your own collection of movies and TV shows.

## Framework
This app is built using the Expo React Native framework.

## Prerequisites
- Node.js and npm installed
- Expo CLI installed (`npm install -g expo-cli`)
- `.env` file with the required TMDB API key

## Setup
1. Clone the repository:
   ```sh
   git clone https://github.com/vjdev1212/byoc.git
   cd vidsrcstream
   ```
2. Create a `.env` file in the project root and set the TMDB API Key:
   ```cmd
   EXPO_PUBLIC_TMDB_API_KEY=api_key_here
   ```
3. Install dependencies:
   ```cmd
   npm install
   ```
4. Start the Expo development server:
   ```cmd
   npx expo start
   ```

## Running on Expo Go
- Scan the QR code from the Expo CLI output using the Expo Go app on your mobile device.

## Stopping the Development Server
To stop the running process, press `Ctrl + C` in the terminal.

## URL Templates

BYOC allows you to use your own streaming service, Stremio addons, or create your own custom backend. The app is flexible and only requires specific metadata to fetch streams.

### Required Information

The app needs the following information to fetch streams:

**For Movies:**
- IMDB ID or TMDB ID

**For TV Shows:**
- IMDB ID or TMDB ID
- Season number
- Episode number

### Template Configuration

URL templates can be configured in **Settings > Template Settings**. You need to provide two templates:

1. **Movie Template** - URL format for fetching movie streams
2. **TV Show Template** - URL format for fetching TV show streams

### Template Placeholders

Use the following placeholders in your templates:

- `{IMDBID}` - IMDB identifier (e.g., tt1234567)
- `{TMDBID}` - TMDB identifier (e.g., 12345)
- `{SEASON}` - Season number (required for TV shows)
- `{EPISODE}` - Episode number (required for TV shows)

**Important:** The TV show template must include `{SEASON}` and `{EPISODE}` placeholders, otherwise it will not work. These parameters are not required for movie templates.

### Example Templates

**Movies:**
```
https://example.com/stream/movie/{IMDBID}
```

**TV Shows:**
```
https://example.com/stream/tv/{IMDBID}/{SEASON}/{EPISODE}
```

### Using Stremio Addons

You can use any Stremio addon that follows the standard manifest format. Example with Torrentio:

**Movies:**
```
https://nuviostreams.hayd.uk/stream/movie/{IMDBID}.json
```

**TV Shows:**
```
https://tnuviostreams.hayd.uk/stream/series/{IMDBID}:{SEASON}:{EPISODE}.json
```

### Required Response Format

Your service or addon must return a JSON response in the following format:

```json
{
  "streams": [
    {
      "name": "Provider Name\nQuality Info",
      "title": "Stream Title with Details\nAdditional metadata",
      "url": "https://example.com/stream/video.mp4"
    },
    {
      "name": "Provider Name\nQuality Info",
      "title": "Another Stream Title\nMore details",
      "url": "https://example.com/stream/video2.mkv"
    }
  ]
}
```

**Response Structure:**
- `streams` (array, required) - Array of available streams
  - `name` (string, optional) - Display name and quality information
  - `title` (string, optional) - Stream title with additional details
  - `url` (string, required) - Direct URL to the video stream

**Note:** Each stream object must include a `url` field pointing to a playable video stream (MP4, MKV, etc.).

### Creating Your Own Service

To create your own streaming service compatible with BYOC:

1. Set up an API endpoint that accepts IMDB/TMDB IDs
2. For TV shows, ensure it also accepts season and episode parameters
3. Return the response in the exact JSON format shown above
4. Host your service and configure the template URL in the app

The service should:
- Accept GET requests
- Return valid JSON
- Include the `streams` array with a valid `url` field for each stream
- Handle both movie and TV show requests appropriately
- Provide direct streaming URLs (MP4, MKV, or other supported video formats)

## Screenshots
<p align="center">
  <img src="https://raw.githubusercontent.com/vjdev1212/byoc/refs/heads/main/byoc-screenshots/iPhone/1-Home%20Screen.png" width="18%" />
  <img src="https://raw.githubusercontent.com/vjdev1212/byoc/refs/heads/main/byoc-screenshots/iPhone/2-Movie-Details.png" width="18%" />
  <img src="https://raw.githubusercontent.com/vjdev1212/byoc/refs/heads/main/byoc-screenshots/iPhone/3-TV-Details.png" width="18%" />
  <img src="https://raw.githubusercontent.com/vjdev1212/byoc/refs/heads/main/byoc-screenshots/iPhone/4-Search.png" width="18%" />
  <img src="https://raw.githubusercontent.com/vjdev1212/byoc/refs/heads/main/byoc-screenshots/iPhone/5-Carousel.png" width="18%" />  
</p>

## LICENSE
Licensed under the GNU General Public License v3.0 (GPL-3.0).