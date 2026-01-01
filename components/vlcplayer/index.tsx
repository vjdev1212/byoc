import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { TouchableOpacity, Animated, Platform } from "react-native";
import { VLCPlayer } from 'react-native-vlc-media-player';
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { MenuComponentRef, MenuView } from '@react-native-menu/menu';
import ImmersiveMode from "react-native-immersive-mode";
import { View, Text } from "../Themed";
import { playHaptic } from "../coreplayer/utils";
import { styles } from "../coreplayer/styles";
import {
    ArtworkBackground,
    WaitingLobby,
    buildAudioActions,
    buildSpeedActions,
    buildSubtitleActions,
    calculateProgress,
    calculateSliderValues,
    CenterControls,
    CONSTANTS,
    ErrorDisplay,
    findActiveSubtitle,
    handleSubtitleError,
    hideControls,
    loadSubtitle,
    performSeek,
    ProgressBar,
    SubtitleDisplay,
    SubtitleSource,
    usePlayerAnimations,
    usePlayerSettings,
    usePlayerState,
    useSubtitleState,
    useTimers,
    useUIState,
    ExtendedMediaPlayerProps,
    buildStreamActions,
} from "../coreplayer";

const useVLCPlayerState = () => {
    const baseState = usePlayerState();
    const [isPaused, setIsPaused] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showBufferingLoader, setShowBufferingLoader] = useState(false);
    const [hasStartedPlaying, setHasStartedPlaying] = useState(false);
    const [isSeeking, setIsSeeking] = useState(false);
    const [availableAudioTracks, setAvailableAudioTracks] = useState<any[]>([]);
    const [playerKey, setPlayerKey] = useState(0);

    return {
        ...baseState,
        isPaused, setIsPaused,
        error, setError,
        showBufferingLoader, setShowBufferingLoader,
        hasStartedPlaying, setHasStartedPlaying,
        isSeeking, setIsSeeking,
        availableAudioTracks, setAvailableAudioTracks,
        playerKey, setPlayerKey
    };
};

const VlcMediaPlayerComponent: React.FC<ExtendedMediaPlayerProps> = ({
    videoUrl,
    title,
    back: onBack,
    progress,
    artwork,
    subtitles = [],
    openSubtitlesClient,
    updateProgress,
    streams = [],
    currentStreamIndex = -1,
    onStreamChange
}) => {
    const playerRef = useRef<VLCPlayer>(null);
    const shouldAutoHideControls = useRef(true);
    const isSeeking = useRef(false);
    const progressUpdateTimerRef = useRef<NodeJS.Timeout | null | any>(null);
    const subtitleIntervalRef = useRef<NodeJS.Timeout | null | any>(null);
    const lastProgressUpdateRef = useRef(0);

    const playerState = useVLCPlayerState();
    const subtitleState = useSubtitleState();
    const uiState = useUIState();
    const settings = usePlayerSettings();
    const timers = useTimers();
    const animations = usePlayerAnimations();

    const [zoom, setZoom] = useState(1.0);

    const audioMenuRef = useRef<MenuComponentRef>(null);
    const subtitleMenuRef = useRef<MenuComponentRef>(null);
    const speedMenuRef = useRef<MenuComponentRef>(null);
    const streamMenuRef = useRef<MenuComponentRef>(null);

    // Check if no stream is selected or videoUrl is empty
    const noStreamSelected = !videoUrl || currentStreamIndex < 0;

    const stateRefs = useRef({
        isPlaying: false,
        isReady: false,
        isDragging: false,
        currentTime: 0,
        duration: 0,
        isPaused: false
    });

    stateRefs.current = {
        isPlaying: playerState.isPlaying,
        isReady: playerState.isReady,
        isDragging: playerState.isDragging,
        currentTime: playerState.currentTime,
        duration: playerState.duration,
        isPaused: playerState.isPaused
    };

    const progressBarValue = useRef(new Animated.Value(0)).current;

    const showControlsTemporarily = useCallback(() => {
        uiState.setShowControls(true);
        Animated.timing(animations.controlsOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true
        }).start();

        timers.clearTimer('hideControls');

        if (stateRefs.current.isPlaying && shouldAutoHideControls.current) {
            timers.setTimer('hideControls', () => {
                hideControls(uiState.setShowControls, animations.controlsOpacity);
            }, CONSTANTS.CONTROLS_AUTO_HIDE_DELAY);
        }
    }, [animations.controlsOpacity, timers, uiState]);

    // Show controls initially when no stream is selected
    useEffect(() => {
        if (noStreamSelected) {
            uiState.setShowControls(true);
            animations.controlsOpacity.setValue(1);
        }
    }, [noStreamSelected]);

    useEffect(() => {
        if (Platform.OS === "android") {
            ImmersiveMode.fullLayout(true);
        }
        return () => {
            if (updateProgress) {
                const progress = calculateProgress(stateRefs.current.currentTime, stateRefs.current.duration);
                updateProgress({ progress });
            }
            timers.clearAllTimers();

            if (progressUpdateTimerRef.current) {
                clearInterval(progressUpdateTimerRef.current);
                progressUpdateTimerRef.current = null;
            }
            if (subtitleIntervalRef.current) {
                clearInterval(subtitleIntervalRef.current);
                subtitleIntervalRef.current = null;
            }

            if (Platform.OS === "android") {
                ImmersiveMode.fullLayout(false);
            }
        };
    }, []);

    useEffect(() => {
        if (subtitles.length === 0 || settings.selectedSubtitle < 0 || settings.selectedSubtitle >= subtitles.length) {
            subtitleState.setParsedSubtitles([]);
            subtitleState.setCurrentSubtitle('');
            return;
        }

        const loadSub = async () => {
            subtitleState.setIsLoadingSubtitles(true);
            try {
                const parsed = await loadSubtitle(subtitles[settings.selectedSubtitle] as SubtitleSource, openSubtitlesClient);
                subtitleState.setParsedSubtitles(parsed);
            } catch (error: any) {
                handleSubtitleError(error);
                subtitleState.setParsedSubtitles([]);
            } finally {
                subtitleState.setIsLoadingSubtitles(false);
                subtitleState.setCurrentSubtitle('');
            }
        };

        loadSub();
    }, [settings.selectedSubtitle, subtitles.length]);

    useEffect(() => {
        if (subtitleState.parsedSubtitles.length === 0) {
            if (subtitleIntervalRef.current) {
                clearInterval(subtitleIntervalRef.current);
                subtitleIntervalRef.current = null;
            }
            return;
        }

        const updateSubtitle = () => {
            if (!stateRefs.current.isPlaying) return;

            const text = findActiveSubtitle(stateRefs.current.currentTime, subtitleState.parsedSubtitles);
            if (subtitleState.currentSubtitle !== text) {
                subtitleState.setCurrentSubtitle(text);
            }
        };

        updateSubtitle();
        subtitleIntervalRef.current = setInterval(updateSubtitle, CONSTANTS.SUBTITLE_UPDATE_INTERVAL);

        return () => {
            if (subtitleIntervalRef.current) {
                clearInterval(subtitleIntervalRef.current);
                subtitleIntervalRef.current = null;
            }
        };
    }, [subtitleState.parsedSubtitles.length]);

    const vlcHandlers = useMemo(() => ({
        onLoad: (data: any) => {
            console.log('VLC onLoad');
            console.log('progress', progress);

            requestAnimationFrame(() => {
                playerState.setIsBuffering(false);
                playerState.setIsReady(true);
                playerState.setError(null);
                playerState.setHasStartedPlaying(true);
                playerState.setIsPlaying(true);
                playerState.setIsPaused(false);
                playerState.setShowBufferingLoader(false);
                playerState.setIsSeeking(false);

                if (data?.audioTracks) {
                    playerState.setAvailableAudioTracks(data.audioTracks);
                }
                if (data?.duration) {
                    const durationInSeconds = data.duration / 1000;
                    playerState.setDuration(durationInSeconds);
                }
                if (progress && progress > 0) {
                    playerRef.current?.seek(progress / 100);
                }
            });

            Animated.timing(animations.bufferOpacity, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }).start();
        },

        onProgress: (data: any) => {
            const { currentTime: current, duration: dur } = data;
            const newCurrentTime = current / 1000;

            if (isSeeking.current) {
                isSeeking.current = false;
                playerState.setIsSeeking(false);
                playerState.setIsBuffering(false);

                Animated.timing(animations.bufferOpacity, {
                    toValue: 0,
                    duration: 100,
                    useNativeDriver: true,
                }).start();
            }

            if (stateRefs.current.isDragging) return;

            const now = Date.now();
            if (now - lastProgressUpdateRef.current < 250) {
                if (stateRefs.current.duration > 0) {
                    const progress = newCurrentTime / stateRefs.current.duration;
                    progressBarValue.setValue(Math.max(0, Math.min(1, progress)));
                }
                return;
            }

            lastProgressUpdateRef.current = now;
            playerState.setCurrentTime(newCurrentTime);

            if (playerState.duration === 0 && dur > 0) {
                playerState.setDuration(dur / 1000);
            }

            if (stateRefs.current.duration > 0) {
                const progress = newCurrentTime / stateRefs.current.duration;
                progressBarValue.setValue(Math.max(0, Math.min(1, progress)));
            }
        },

        onBuffering: (data: any) => {
            const { isBuffering: buffering } = data;

            if (buffering && stateRefs.current.isReady) {
                requestAnimationFrame(() => {
                    playerState.setIsBuffering(true);
                    Animated.timing(animations.bufferOpacity, {
                        toValue: 1,
                        duration: 200,
                        useNativeDriver: true,
                    }).start();
                });
            }
        },

        onPlaying: () => {
            console.log('VLC onPlaying event');
            requestAnimationFrame(() => {
                playerState.setIsPlaying(true);
                playerState.setIsPaused(false);
                playerState.setIsBuffering(false);
                playerState.setShowBufferingLoader(false);
                isSeeking.current = false;
            });

            Animated.timing(animations.bufferOpacity, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }).start();
        },

        onPaused: () => {
            console.log('VLC onPaused event');
            requestAnimationFrame(() => {
                playerState.setIsPlaying(false);
                playerState.setIsPaused(true);
            });
        },

        onStopped: () => {
            console.log('VLC onStopped event');
            requestAnimationFrame(() => {
                playerState.setIsPlaying(false);
                playerState.setIsPaused(false);
            });
        },

        onEnd: () => {
            console.log('VLC onEnd event');
            requestAnimationFrame(() => {
                playerState.setIsPlaying(false);
                playerState.setIsPaused(false);
            });
        },

        onError: (error: any) => {
            console.error('VLC error:', error);
            let errorMessage = "Unable to load the video.";
            if (error?.error) {
                errorMessage = `Unable to load the video. ${error.error}`;
            }

            requestAnimationFrame(() => {
                playerState.setError(errorMessage);
                playerState.setIsBuffering(false);
                playerState.setIsReady(false);
                playerState.setShowBufferingLoader(false);
            });
        }
    }), []);

    useEffect(() => {
        if (!updateProgress || !playerState.isReady || playerState.duration <= 0) {
            if (progressUpdateTimerRef.current) {
                clearInterval(progressUpdateTimerRef.current);
                progressUpdateTimerRef.current = null;
            }
            return;
        }

        progressUpdateTimerRef.current = setInterval(() => {
            const progress = calculateProgress(stateRefs.current.currentTime, stateRefs.current.duration);
            updateProgress({ progress });
        }, 10 * 60 * 1000);

        return () => {
            if (progressUpdateTimerRef.current) {
                clearInterval(progressUpdateTimerRef.current);
                progressUpdateTimerRef.current = null;
            }
        };
    }, [playerState.isReady, playerState.duration > 0]);

    const handleZoomIn = useCallback(async () => {
        await playHaptic();
        setZoom(prev => {
            const newZoom = Math.min(prev + 0.05, 1.5);
            return Math.round(newZoom * 100) / 100;
        });
        showControlsTemporarily();
    }, [showControlsTemporarily]);

    const handleZoomOut = useCallback(async () => {
        await playHaptic();
        setZoom(prev => {
            const newZoom = Math.max(prev - 0.05, 1.0);
            return Math.round(newZoom * 100) / 100;
        });
        showControlsTemporarily();
    }, [showControlsTemporarily]);

    const togglePlayPause = useCallback(async () => {
        if (!stateRefs.current.isReady) return;

        await playHaptic();

        const newPausedState = !stateRefs.current.isPaused;

        playerState.setIsPaused(newPausedState);
        playerState.setIsPlaying(!newPausedState);

        showControlsTemporarily();
    }, [playerState, showControlsTemporarily]);

    const seekTo = useCallback((seconds: number) => {
        if (!playerRef.current || stateRefs.current.duration <= 0) return;
        const clampedTime = performSeek(seconds, stateRefs.current.duration);
        const position = clampedTime / stateRefs.current.duration;

        isSeeking.current = true;
        playerState.setIsSeeking(true);
        playerState.setIsBuffering(true);
        playerState.setCurrentTime(clampedTime);
        progressBarValue.setValue(position);

        Animated.timing(animations.bufferOpacity, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
        }).start();

        playerRef.current?.seek(position);
        showControlsTemporarily();
    }, [playerState, showControlsTemporarily, progressBarValue, animations.bufferOpacity]);

    const skipTime = useCallback(async (seconds: number) => {
        if (!stateRefs.current.isReady) return;
        await playHaptic();
        seekTo(stateRefs.current.currentTime + seconds);
    }, [seekTo]);

    const handleOverlayPress = useCallback(() => {
        if (uiState.showControls) {
            hideControls(uiState.setShowControls, animations.controlsOpacity);
        } else {
            showControlsTemporarily();
        }
    }, [uiState.showControls, showControlsTemporarily, animations.controlsOpacity, uiState]);

    const handleSliderChange = useCallback((value: number) => {
        if (!stateRefs.current.isReady || stateRefs.current.duration <= 0) return;
        playerState.setIsDragging(true);
        playerState.setDragPosition(value);
        progressBarValue.setValue(value);
    }, [progressBarValue, playerState]);

    const handleSliderComplete = useCallback((value: number) => {
        if (stateRefs.current.isReady && stateRefs.current.duration > 0) {
            const newTime = value * stateRefs.current.duration;
            seekTo(newTime);
        }
        playerState.setIsDragging(false);
    }, [seekTo, playerState]);

    const handleSpeedSelect = useCallback(async (speed: number) => {
        await playHaptic();
        settings.setPlaybackSpeed(speed);
        showControlsTemporarily();
    }, [settings, showControlsTemporarily]);

    const handleSubtitleSelect = useCallback(async (index: number) => {
        await playHaptic();
        settings.setSelectedSubtitle(index);
    }, [settings]);

    const handleAudioSelect = useCallback(async (index: number) => {
        await playHaptic();
        settings.setSelectedAudioTrack(index);
        showControlsTemporarily();
    }, [settings, showControlsTemporarily]);

    const handleStreamSelect = useCallback(async (index: number) => {
        await playHaptic();

        // Reset player state for stream change
        playerState.setIsReady(false);
        playerState.setIsBuffering(true);
        playerState.setHasStartedPlaying(false);
        playerState.setCurrentTime(0);
        playerState.setDuration(0);
        playerState.setIsPaused(false);
        playerState.setIsPlaying(false);
        progressBarValue.setValue(0);

        // Force player remount by changing key
        playerState.setPlayerKey(prev => prev + 1);

        if (onStreamChange) {
            onStreamChange(index);
        }

        showControlsTemporarily();
    }, [onStreamChange, showControlsTemporarily, playerState, progressBarValue]);

    const speedActions = useMemo(() =>
        buildSpeedActions(settings.playbackSpeed),
        [settings.playbackSpeed]
    );

    const subtitleActions = useMemo(() =>
        buildSubtitleActions(subtitles as SubtitleSource[], settings.selectedSubtitle, true),
        [subtitles.length, settings.selectedSubtitle]
    );

    const audioActions = useMemo(() =>
        buildAudioActions(playerState.availableAudioTracks, settings.selectedAudioTrack),
        [playerState.availableAudioTracks.length, settings.selectedAudioTrack]
    );

    const streamActions = useMemo(() =>
        buildStreamActions(streams, currentStreamIndex),
        [streams.length, currentStreamIndex]
    );

    const { displayTime, sliderValue } = useMemo(() =>
        calculateSliderValues(
            playerState.isDragging,
            playerState.dragPosition,
            playerState.currentTime,
            playerState.duration
        ),
        [playerState.isDragging, playerState.dragPosition, playerState.currentTime, playerState.duration]
    );

    const handleBack = useCallback(async () => {
        await playHaptic();
        const progress = calculateProgress(stateRefs.current.currentTime, stateRefs.current.duration);
        onBack({ message: '', progress, player: "vlc" });
    }, [onBack]);

    return (
        <View style={styles.container}>
            {/* Only render VLCPlayer if a stream is selected */}
            {!noStreamSelected && (
                <VLCPlayer
                    key={playerState.playerKey}
                    ref={playerRef}
                    style={[styles.video, {
                        transform: [{ scale: zoom }]
                    }]}
                    source={{
                        uri: videoUrl,
                        initType: 2,
                        initOptions: [
                            '--no-sub-autodetect-file',
                            '--no-spu'
                        ]
                    }}
                    autoplay={true}
                    playInBackground={true}
                    autoAspectRatio={true}
                    resizeMode="cover"
                    textTrack={-1}
                    acceptInvalidCertificates={true}
                    rate={settings.playbackSpeed}
                    muted={settings.isMuted}
                    audioTrack={settings.selectedAudioTrack}
                    paused={playerState.isPaused}
                    onPlaying={vlcHandlers.onPlaying}
                    onProgress={vlcHandlers.onProgress}
                    onLoad={vlcHandlers.onLoad}
                    onBuffering={vlcHandlers.onBuffering}
                    onPaused={vlcHandlers.onPaused}
                    onStopped={vlcHandlers.onStopped}
                    onEnd={vlcHandlers.onEnd}
                    onError={vlcHandlers.onError}
                />
            )}

            <ErrorDisplay
                error={playerState.error}
                onBack={handleBack}
                onRetry={() => {
                    playerState.setError(null);
                    playerState.setIsReady(false);
                    playerState.setIsBuffering(true);
                    playerState.setHasStartedPlaying(false);
                }}
            />

            <ArtworkBackground
                artwork={artwork}
                isBuffering={playerState.isBuffering}
                hasStartedPlaying={playerState.hasStartedPlaying}
                error={!!playerState.error}
            />


            <WaitingLobby
                noStreamSelected={noStreamSelected}
                hasStartedPlaying={playerState.hasStartedPlaying}
                opacity={animations.bufferOpacity}
                error={!!playerState.error}
            />

            <TouchableOpacity style={styles.touchArea} activeOpacity={1} onPress={handleOverlayPress} />

            {!noStreamSelected && (
                <SubtitleDisplay subtitle={subtitleState.currentSubtitle} error={!!playerState.error} />
            )}

            {uiState.showControls && (
                <Animated.View
                    style={[
                        styles.controlsOverlay,
                        { opacity: noStreamSelected ? 1 : animations.controlsOpacity }
                    ]}
                    pointerEvents="box-none"
                >
                    <View style={styles.topControls}>
                        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                            <Ionicons name="chevron-back" size={28} color="white" />
                        </TouchableOpacity>

                        <View style={styles.titleContainer}>
                            <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
                        </View>

                        <View style={styles.topRightControls}>
                            {streams.length > 1 && (
                                <MenuView
                                    ref={streamMenuRef}
                                    title="Select Stream"
                                    onPressAction={({ nativeEvent }) => {
                                        const index = parseInt(nativeEvent.event.split('-')[1]);
                                        if (!isNaN(index)) handleStreamSelect(index);
                                    }}
                                    actions={streamActions}
                                    shouldOpenOnLongPress={false}
                                    themeVariant="dark"
                                    onOpenMenu={() => {
                                        shouldAutoHideControls.current = false;
                                        timers.clearTimer('hideControls');
                                    }}
                                    onCloseMenu={() => {
                                        shouldAutoHideControls.current = true;
                                        showControlsTemporarily();
                                    }}
                                >
                                    <TouchableOpacity
                                        style={styles.controlButton}
                                        onPress={() => {
                                            if (Platform.OS === 'android') {
                                                streamMenuRef.current?.show();
                                            }
                                        }}
                                    >
                                        <MaterialIcons name="ondemand-video" size={24} color="white" />
                                    </TouchableOpacity>
                                </MenuView>
                            )}

                            <TouchableOpacity style={styles.controlButton} onPress={handleZoomOut}>
                                <MaterialIcons name="zoom-out" size={24} color="white" />
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.controlButton} onPress={handleZoomIn}>
                                <MaterialIcons name="zoom-in" size={24} color="white" />
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.controlButton} onPress={async () => {
                                await playHaptic();
                                settings.setIsMuted(!settings.isMuted);
                                showControlsTemporarily();
                            }}>
                                <Ionicons name={settings.isMuted ? "volume-mute" : "volume-high"} size={24} color="white" />
                            </TouchableOpacity>

                            {playerState.availableAudioTracks.length > 0 && (
                                <MenuView
                                    ref={audioMenuRef}
                                    title="Audio Track"
                                    onPressAction={({ nativeEvent }) => {
                                        const index = audioActions.findIndex(a => a.id === nativeEvent.event);
                                        if (index !== -1) handleAudioSelect(index);
                                    }}
                                    actions={audioActions}
                                    shouldOpenOnLongPress={false}
                                    themeVariant="dark"
                                    onOpenMenu={() => {
                                        shouldAutoHideControls.current = false;
                                        timers.clearTimer('hideControls');
                                    }}
                                    onCloseMenu={() => {
                                        shouldAutoHideControls.current = true;
                                        showControlsTemporarily();
                                    }}
                                >
                                    <TouchableOpacity
                                        style={styles.controlButton}
                                        onPress={() => {
                                            if (Platform.OS === 'android') {
                                                audioMenuRef.current?.show();
                                            }
                                        }}
                                    >
                                        <MaterialIcons name="multitrack-audio" size={24} color="white" />
                                    </TouchableOpacity>
                                </MenuView>
                            )}

                            {subtitles.length > 0 && (
                                <MenuView
                                    ref={subtitleMenuRef}
                                    style={{ zIndex: 1000 }}
                                    title="Subtitles"
                                    onPressAction={({ nativeEvent }) => {
                                        if (nativeEvent.event === 'subtitle-off') {
                                            handleSubtitleSelect(-1);
                                        } else {
                                            const index = parseInt(nativeEvent.event.split('-')[1]);
                                            if (!isNaN(index)) handleSubtitleSelect(index);
                                        }
                                    }}
                                    actions={subtitleActions}
                                    shouldOpenOnLongPress={false}
                                    themeVariant="dark"
                                    onOpenMenu={() => {
                                        shouldAutoHideControls.current = false;
                                        timers.clearTimer('hideControls');
                                    }}
                                    onCloseMenu={() => {
                                        shouldAutoHideControls.current = true;
                                        showControlsTemporarily();
                                    }}
                                >
                                    <TouchableOpacity
                                        style={styles.controlButton}
                                        onPress={() => {
                                            if (Platform.OS === 'android') {
                                                subtitleMenuRef.current?.show();
                                            }
                                        }}
                                    >
                                        <MaterialIcons name="closed-caption" size={24} color="white" />
                                    </TouchableOpacity>
                                </MenuView>
                            )}

                            <MenuView
                                ref={speedMenuRef}
                                title="Playback Speed"
                                onPressAction={({ nativeEvent }) => {
                                    const speed = parseFloat(nativeEvent.event.split('-')[1]);
                                    if (!isNaN(speed)) handleSpeedSelect(speed);
                                }}
                                actions={speedActions}
                                shouldOpenOnLongPress={false}
                                themeVariant="dark"
                                onOpenMenu={() => {
                                    shouldAutoHideControls.current = false;
                                    timers.clearTimer('hideControls');
                                }}
                                onCloseMenu={() => {
                                    shouldAutoHideControls.current = true;
                                    showControlsTemporarily();
                                }}
                            >
                                <TouchableOpacity
                                    style={styles.controlButton}
                                    onPress={() => {
                                        if (Platform.OS === 'android') {
                                            speedMenuRef.current?.show();
                                        }
                                    }}
                                >
                                    <MaterialIcons name="speed" size={24} color="white" />
                                </TouchableOpacity>
                            </MenuView>
                        </View>
                    </View>

                    <CenterControls
                        isPlaying={playerState.isPlaying}
                        isReady={playerState.isReady}
                        isBuffering={playerState.isBuffering}
                        onPlayPause={togglePlayPause}
                        onSkipBackward={() => skipTime(-10)}
                        onSkipForward={() => skipTime(10)}
                    />

                    <View style={styles.bottomControls}>
                        <ProgressBar
                            currentTime={displayTime}
                            duration={playerState.duration}
                            sliderValue={sliderValue}
                            isReady={playerState.isReady}
                            onValueChange={handleSliderChange}
                            onSlidingStart={() => {
                                playerState.setIsDragging(true);
                                showControlsTemporarily();
                            }}
                            onSlidingComplete={handleSliderComplete}
                            showSpeed={settings.playbackSpeed !== 1.0}
                            playbackSpeed={settings.playbackSpeed}
                        />
                    </View>
                </Animated.View>
            )}
        </View>
    );
};

export const MediaPlayer = React.memo(VlcMediaPlayerComponent);