import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, Platform, ActivityIndicator, View, Text, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ScreenOrientation from 'expo-screen-orientation';
import {
  defaultMovieUrlTemplate,
  defaultTvShowUrlTemplate,
} from '@/constants/Embed';


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

  const artwork = `https://images.metahub.space/background/medium/${imdbid}/img`;

  // Memoize the URL generator to prevent recreating on every render
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

  // Load settings only once on mount
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
  }, []); // Empty dependency array - only run once

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

  // Generate video URL when dependencies change
  useEffect(() => {
    if (imdbid && (movieUrlTemplate || seriesUrlTemplate)) {
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
      
      if (url !== videoUrl) { // Only update if URL actually changed
        setVideoUrl(url);
        setIsLoading(false);
      }
    }
  }, [imdbid, tmdbid, type, season, episode, movieUrlTemplate, seriesUrlTemplate, generateUrl, videoUrl]);

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

  const Player = React.useMemo(() => {
    if (Platform.OS === "web") {
      return require("@/components/nativeplayer").MediaPlayer;
    }

    if (currentPlayerType === "vlc") {
      return require("@/components/vlcplayer").MediaPlayer;
    }

    return require("@/components/nativeplayer").MediaPlayer;
  }, [currentPlayerType]);

  if (isLoading) {
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
          <Text style={styles.loadingText}>Loading player...</Text>
        </View>
      </View>
    );
  }

  if (!videoUrl) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No video URL available.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Player
        videoUrl={videoUrl}
        isTorrent={false}
        title={name}
        back={handleBack}
        progress={progress}
        artwork={artwork as string}
        updateProgress={handleUpdateProgress}
        onPlaybackError={handlePlaybackError}
        streams={[]}
        currentStreamIndex={0}
        onStreamChange={() => {}}
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