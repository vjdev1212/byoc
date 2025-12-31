import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, Platform, ActivityIndicator, View, Text, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ScreenOrientation from 'expo-screen-orientation';
import {
  defaultMovieUrlTemplate,
  defaultTvShowUrlTemplate,
} from '@/constants/Embed';

interface Stream {
  name: string;
  title?: string;
  url?: string;
  embed?: string;
  infoHash?: string;
  magnet?: string;
  magnetLink?: string;
  description?: string;
}

interface StreamResponse {
  streams: Stream[];
}

interface UpdateProgressEvent {
  progress: number;
}

const EmbedPlayer = () => {
  const { imdbid, tmdbid, name, type, season, episode } = useLocalSearchParams();
  
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [movieUrlTemplate, setMovieUrlTemplate] = useState<string>(defaultMovieUrlTemplate);
  const [seriesUrlTemplate, setSeriesUrlTemplate] = useState<string>(defaultTvShowUrlTemplate);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [progress, setProgress] = useState(0);
  const [currentPlayerType, setCurrentPlayerType] = useState<"native" | "vlc">("native");
  const [hasTriedNative, setHasTriedNative] = useState(false);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [currentStreamIndex, setCurrentStreamIndex] = useState<number>(0);
  const [isLoadingStreams, setIsLoadingStreams] = useState<boolean>(true);

  const artwork = `https://images.metahub.space/background/medium/${imdbid}/img`;

  const generateUrl = useCallback((
    template: string, 
    { imdbid, tmdbid, season = '1', episode = '1' }: { 
      imdbid: string; 
      tmdbid: string; 
      season?: string; 
      episode?: string; 
    }
  ) => {
    return template
      .replace(/(\{ID\})/gi, tmdbid)
      .replace(/(\{TMDBID\})/gi, tmdbid)
      .replace(/(\{TMDB_ID\})/gi, tmdbid)
      .replace(/(\{IMDBID\})/gi, imdbid)
      .replace(/(\{IMDB_ID\})/gi, imdbid)
      .replace(/(\{SEASON\})/gi, season.toString())
      .replace(/(\{SEASONNUMBER\})/gi, season.toString())
      .replace(/(\{SEASON_NUMBER\})/gi, season.toString())
      .replace(/(\{SEASONNO\})/gi, season.toString())
      .replace(/(\{SEASON_NO\})/gi, season.toString())
      .replace(/(\{EPISODE\})/gi, episode.toString())
      .replace(/(\{EPISODENO\})/gi, episode.toString())
      .replace(/(\{EPISODE_NO\})/gi, episode.toString())
      .replace(/(\{EPISODENUMBER\})/gi, episode.toString())
      .replace(/(\{EPISODE_NUMBER\})/gi, episode.toString());
  }, []);

  // Load settings
  useEffect(() => {
    const loadEmbedSettings = async () => {
      try {
        const storedSettings = await AsyncStorage.getItem('embedSettings');
        if (storedSettings) {
          const parsedSettings = JSON.parse(storedSettings);
          setMovieUrlTemplate(parsedSettings.movie?.template ?? defaultMovieUrlTemplate);
          setSeriesUrlTemplate(parsedSettings.tv?.template ?? defaultTvShowUrlTemplate);
        }
      } catch (error) {
        console.error('Failed to load embed settings:', error);
      }
    };

    loadEmbedSettings();
  }, []);

  // Setup screen orientation
  useEffect(() => {
    const setupPlayer = async () => {
      if (Platform.OS !== 'web') {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      }
    };

    setupPlayer();
    return () => {
      if (Platform.OS !== 'web') {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT);
      }
    };
  }, []);

  // Fetch streams from URL
  useEffect(() => {
    const fetchStreams = async () => {
      if (!imdbid || !movieUrlTemplate && !seriesUrlTemplate) return;

      setIsLoadingStreams(true);
      try {
        let url = '';
        if (type === 'movie') {
          url = generateUrl(movieUrlTemplate, { 
            imdbid: imdbid as string, 
            tmdbid: tmdbid as string 
          });
        } else if (type === 'series' && season && episode) {
          url = generateUrl(seriesUrlTemplate, {
            imdbid: imdbid as string,
            tmdbid: tmdbid as string,
            season: season as string,
            episode: episode as string
          });
        }

        if (url) {
          console.log('Fetching streams from:', url);
          
          try {
            const response = await fetch(url, {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
              },
            });

            console.log('Response status:', response.status);

            if (!response.ok) {
              console.log(`HTTP ${response.status} - falling back to direct embed`);
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Get the response text first to check what we received
            const responseText = await response.text();
            const preview = responseText.substring(0, 200);
            console.log('Response preview:', preview);

            // Check if response is HTML (error page) or not JSON
            if (responseText.trim().startsWith('<') || responseText.trim().startsWith('<!')) {
              console.log('Received HTML instead of JSON - treating as direct embed URL');
              throw new Error('HTML_RESPONSE');
            }

            let data: StreamResponse;
            try {
              data = JSON.parse(responseText);
            } catch (parseError) {
              console.error('JSON parse failed - treating as direct embed URL');
              throw new Error('PARSE_ERROR');
            }
            
            if (data.streams && data.streams.length > 0) {
              console.log(`Found ${data.streams.length} streams`);
              setStreams(data.streams);
              
              // Set initial video URL from first stream
              const firstStream = data.streams[0];
              const streamUrl = firstStream.url || firstStream.embed || firstStream.magnet || firstStream.magnetLink || '';
              
              if (!streamUrl) {
                throw new Error('First stream has no playable URL');
              }
              
              console.log('Using stream URL:', streamUrl);
              setVideoUrl(streamUrl);
              setCurrentStreamIndex(0);
            } else {
              console.log('No streams in response - treating as direct embed URL');
              throw new Error('NO_STREAMS');
            }
          } catch (fetchError: any) {
            // If fetch fails or returns non-JSON, treat the URL as a direct embed URL
            console.log('Falling back to direct embed mode:', fetchError.message);
            
            // Create a single "stream" from the URL itself
            const directStream: Stream = {
              name: 'Direct Embed',
              title: 'Direct Embed Stream',
              embed: url,
              url: url
            };
            
            setStreams([directStream]);
            setVideoUrl(url);
            setCurrentStreamIndex(0);
          }
        }
      } catch (error: any) {
        console.error('Fatal error in fetchStreams:', error);
        setStreams([]);
        setVideoUrl('');
      } finally {
        setIsLoadingStreams(false);
        setIsLoading(false);
      }
    };

    fetchStreams();
  }, [imdbid, tmdbid, type, season, episode, movieUrlTemplate, seriesUrlTemplate, generateUrl]);

  const handleBack = async (): Promise<void> => {
    router.back();
  };

  const handleUpdateProgress = useCallback(async (event: UpdateProgressEvent): Promise<void> => {
    if (event.progress <= 1) return;
    const progressPercentage = Math.floor(event.progress);
    setProgress(progressPercentage);
  }, []);

  const handlePlaybackError = useCallback(() => {
    if (currentPlayerType === "native" && !hasTriedNative && Platform.OS !== "web") {
      setHasTriedNative(true);
      setCurrentPlayerType("vlc");
    }
  }, [currentPlayerType, hasTriedNative]);

  const handleStreamChange = useCallback((index: number) => {
    if (index >= 0 && index < streams.length) {
      const selectedStream = streams[index];
      const streamUrl = selectedStream.url || selectedStream.embed || selectedStream.magnet || selectedStream.magnetLink || '';
      setVideoUrl(streamUrl);
      setCurrentStreamIndex(index);
      
      // Determine if it's a torrent/magnet link
      const isTorrent = !!(selectedStream.infoHash || selectedStream.magnet || selectedStream.magnetLink);
      
      // If it's a torrent and we're not already using VLC, switch to VLC
      if (isTorrent && currentPlayerType === "native" && Platform.OS !== "web") {
        setCurrentPlayerType("vlc");
      }
    }
  }, [streams, currentPlayerType]);

  const Player = React.useMemo(() => {
    if (Platform.OS === "web") {
      return require("@/components/nativeplayer").MediaPlayer;
    }

    if (currentPlayerType === "vlc") {
      return require("@/components/vlcplayer").MediaPlayer;
    }

    return require("@/components/nativeplayer").MediaPlayer;
  }, [currentPlayerType]);

  if (isLoading || isLoadingStreams) {
    return (
      <View style={styles.container}>
        {artwork && (
          <Image
            source={{ uri: artwork }}
            style={styles.backdropImage}
          />
        )}
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#535aff" />
          <Text style={styles.loadingText}>
            {isLoadingStreams ? 'Loading streams...' : 'Loading player...'}
          </Text>
        </View>
      </View>
    );
  }

  if (!videoUrl || streams.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No streams available.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Player
        videoUrl={videoUrl}
        isTorrent={!!(streams[currentStreamIndex]?.infoHash || streams[currentStreamIndex]?.magnet || streams[currentStreamIndex]?.magnetLink)}
        title={name}
        back={handleBack}
        progress={progress}
        artwork={artwork as string}
        updateProgress={handleUpdateProgress}
        onPlaybackError={handlePlaybackError}
        streams={streams}
        currentStreamIndex={currentStreamIndex}
        onStreamChange={handleStreamChange}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backdropImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
    opacity: 0.2,
  },
  loadingOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 20,
    fontSize: 16,
    fontWeight: '500',
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
});

export default EmbedPlayer;