import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, Platform, ActivityIndicator, View, Text, Image, StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ScreenOrientation from 'expo-screen-orientation';
import OpenSubtitlesClient, { SubtitleResult } from '@/client/opensubtitles';
import { Subtitle } from '@/components/coreplayer/models';

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
  const { imdbid, tmdbid, name, title, type, season, episode } = useLocalSearchParams();

  const [videoUrl, setVideoUrl] = useState<string>('');
  const [movieUrlTemplate, setMovieUrlTemplate] = useState<string>('');
  const [seriesUrlTemplate, setSeriesUrlTemplate] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [progress, setProgress] = useState(0);
  const [currentPlayerType, setCurrentPlayerType] = useState<"native" | "vlc">("native");
  const [hasTriedNative, setHasTriedNative] = useState(false);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [currentStreamIndex, setCurrentStreamIndex] = useState<number>(-1);
  const [isLoadingStreams, setIsLoadingStreams] = useState<boolean>(true);

  // Subtitle support
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [isLoadingSubtitles, setIsLoadingSubtitles] = useState(true);
  const [openSubtitlesClient, setOpenSubtitlesClient] = useState<OpenSubtitlesClient | null>(null);

  const artwork = `https://images.metahub.space/background/medium/${imdbid}/img`;

  const setupOrientation = async () => {
    if (Platform.OS !== 'web') {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        StatusBar.setHidden(true);
      } catch (error) {
        console.warn("Failed to set orientation:", error);
      }
    }
  };

  const cleanupOrientation = async () => {
    if (Platform.OS !== 'web') {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT);
      StatusBar.setHidden(false);
    }
  };

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
          setMovieUrlTemplate(parsedSettings.movie?.template ?? '');
          setSeriesUrlTemplate(parsedSettings.tv?.template ?? '');
        }
      } catch (error) {
        console.error('Failed to load embed settings:', error);
      }
    };

    loadEmbedSettings();
  }, []);

  // Setup screen orientation
  useEffect(() => {
    setupOrientation();
    return () => {
      cleanupOrientation();
    };
  }, []);

  // Initialize OpenSubtitles client
  useEffect(() => {
    const initializeClient = async () => {
      try {
        const client = new OpenSubtitlesClient();
        setOpenSubtitlesClient(client);
      } catch (error) {
        console.error('Failed to initialize OpenSubtitles client:', error);
        setOpenSubtitlesClient(null);
        setSubtitles([]);
        setIsLoadingSubtitles(false);
      }
    };

    initializeClient();
  }, []);

  // Fetch subtitles when parameters change
  useEffect(() => {
    if (openSubtitlesClient) {
      fetchSubtitles();
    }
  }, [imdbid, type, season, episode, openSubtitlesClient]);

  // Fetch streams from URL
  useEffect(() => {
    const fetchStreams = async () => {
      if (!imdbid || (!movieUrlTemplate && !seriesUrlTemplate)) {
        setIsLoadingStreams(false);
        setIsLoading(false);
        return;
      }

      setIsLoadingStreams(true);
      try {
        let url = '';
        if (type === 'movie' && movieUrlTemplate) {
          url = generateUrl(movieUrlTemplate, {
            imdbid: imdbid as string,
            tmdbid: tmdbid as string
          });
        } else if (type === 'series' && season && episode && seriesUrlTemplate) {
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
              console.log('Received HTML instead of JSON - treating as direct URL');
              throw new Error('HTML_RESPONSE');
            }

            let data: StreamResponse;
            try {
              data = JSON.parse(responseText);
            } catch (parseError) {
              console.error('JSON parse failed - treating as direct URL');
              throw new Error('PARSE_ERROR');
            }

            if (data.streams && data.streams.length > 0) {
              console.log(`Found ${data.streams.length} streams`);
              setStreams(data.streams);

              if (streams.length == 1) {
                setVideoUrl(data.streams[0].url ?? '');
                setCurrentStreamIndex(0);
              }
              else {
                setVideoUrl('');
                setCurrentStreamIndex(-1);
              }
            } else {
              console.log('No streams in response - treating as direct URL');
              throw new Error('NO_STREAMS');
            }
          } catch (fetchError: any) {
            // If fetch fails or returns non-JSON, treat the URL as a direct URL
            console.log('Falling back to direct mode:', fetchError.message);

            // Create a single "stream" from the URL itself
            const directStream: Stream = {
              name: 'Direct Embed',
              title: 'Direct Embed Stream',
              embed: url,
              url: url
            };

            setStreams([directStream]);
            setVideoUrl('');
            setCurrentStreamIndex(-1);
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

  const fetchSubtitles = async () => {
    if (!openSubtitlesClient) {
      setIsLoadingSubtitles(false);
      return;
    }

    try {
      setIsLoadingSubtitles(true);

      const response = await openSubtitlesClient.searchByFileName(
        title as string,
        ['en'],
        {
          format: 'srt',
          ai_translated: 'include',
          machine_translated: 'include',
          trusted_sources: 'include',
          hearing_impaired: 'include'
        }
      );

      if (response.success) {
        if (response.data.length === 0) {
          setSubtitles([]);
          setIsLoadingSubtitles(false);
          return;
        }
        const sortedData = response.data.sort((a: any, b: any) => b.download_count - a.download_count);

        const transformedSubtitles: Subtitle[] = sortedData.map((subtitle: SubtitleResult) => ({
          fileId: subtitle.file_id,
          language: subtitle.language,
          url: subtitle.url,
          label: `${subtitle.name}`
        }));

        setSubtitles(transformedSubtitles);
      } else {
        console.error('Failed to fetch subtitles:', response.error);
        setSubtitles([]);
      }
    } catch (error) {
      console.error('Error fetching subtitles:', error);
      setSubtitles([]);
    } finally {
      setIsLoadingSubtitles(false);
    }
  };

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
    if (currentPlayerType === "vlc") {
      return require("@/components/vlcplayer").MediaPlayer;
    }

    return require("@/components/vlcplayer").MediaPlayer;
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

  if (streams.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No streams available. Please configure embed settings.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Player
        videoUrl={videoUrl}
        isTorrent={currentStreamIndex >= 0 ? !!(streams[currentStreamIndex]?.infoHash || streams[currentStreamIndex]?.magnet || streams[currentStreamIndex]?.magnetLink) : false}
        title={title}
        back={handleBack}
        progress={progress}
        artwork={artwork as string}
        updateProgress={handleUpdateProgress}
        onPlaybackError={handlePlaybackError}
        streams={streams}
        currentStreamIndex={currentStreamIndex}
        onStreamChange={handleStreamChange}
        subtitles={subtitles}
        openSubtitlesClient={openSubtitlesClient}
        isLoadingSubtitles={isLoadingSubtitles}
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