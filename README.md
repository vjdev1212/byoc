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
2. Create a `.env` file in the project root and set the TMDB API Key
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

The URL templates can be modified in the Settings > Template Settings page. Update them as needed to customize the embed URLs.

Use the following URL templates to embed movie and TV show content from any provider:

- **Movies:**
  ```sh
  https://nuviostreams.hayd.uk/stream/movie/{IMDBID}.json
  ```

- **TV Shows:**
  ```sh
  https://nuviostreams.hayd.uk/stream/series/{IMDBID}:{SEASON}:{EPISODE}.json
  ```

Ensure that {IMDBID}, {SEASON}, and {EPISODE} are included in the TV show URL; otherwise, it will not work. The {SEASON} and {EPISODE} parameters are not required for the movie template.

## Docker support

This project is available as docker container. Use the below yaml script.

```yaml
version: '3.0'

name: BYOC
services:
  byoc:
    container_name: byoc
    hostname: byoc
    image: vjdev1212/byoc:latest
    ports:
      - "4444:80"
    restart: unless-stopped
```

## Screenshots



## LICENSE

Licensed under the GNU General Public License v3.0 (GPL-3.0).
