import React, { useState, useRef, useEffect, Component } from "react";
import {
  View, Text, StyleSheet, Animated, Easing, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform, TextInput, Modal, Pressable, PanResponder, ActivityIndicator, useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { BlurView } from "expo-blur";
import { type CameraType, type FlashMode, useCameraPermissions } from "expo-camera";
import { manipulateAsync, FlipType, SaveFormat } from "expo-image-manipulator";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { useAudioRecorder, AudioModule, RecordingPresets, useAudioPlayer, useAudioPlayerStatus, useAudioRecorderState } from "expo-audio";
import { SeamlessRecorder, type SeamlessRecorderRef } from "seamless-recorder";
import { setCaptureData } from "../../lib/capture-store";
import { useUpload } from "../../lib/upload-context";
import DrawingCanvas, { type DrawingCanvasRef } from "../DrawingCanvas";
import { SendIcon, FeatherIcon, FlipIcon, CloseIcon, FlashIcon } from "./GroupIcons";
import { VolumeManager } from "react-native-volume-manager";
import ChallengesModal from "./ChallengesModal";
import { type ActiveChallenge } from "../../lib/challenges";
import { radii, spacing, stroke, blur, typography, textStyles, glassBlurIntensity, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import Shape from "../Shape";
import Icon, { type IconName } from "../Icon";
import { AudioCaptionPlayer } from "../molecules/AudioCaptionPlayer";

const NAVBAR_HEIGHT = 100;
// Espace entre le haut du cadre de capture et le bouton Défis (par-dessus la caméra).
const CHALLENGE_GAP = 16;
// Zone du sélecteur de mode : 80% de l'écran, plafonnée à cette largeur max.
// Les 3 modes se partagent 1/3 chacun (flex: 1).
const MODE_SELECTOR_MAX_WIDTH = 320;
// Palette de couleurs du dessin (2 lignes de 7). Défaut = #FF561A.
const DRAWING_COLORS: string[][] = [
  ["#FFFFFF", "#F23F3A", "#FE76B4", "#FFC548", "#00B487", "#6DD0F0", "#7659FF"],
  ["#000000", "#9D1233", "#C0169A", "#FF561A", "#0C493A", "#1F48B1", "#1F106D"],
];

type CameraMode = "PHOTO" | "VIDEO" | "AUDIO" | "DESSIN" | "TEXTE";

type SlotData = {
  mode: CameraMode;
  uri: string | null;
  audioUri: string | null;
  waveform?: number[];
  textContent: string;
  note: string;
  captionAudioUri?: string | null;
  captionWaveform?: number[];
};

type GroupInfo = { id: string; name: string };

type Props = {
  groupId: string;
  userId: string;
  isActive: boolean;
  allGroups: GroupInfo[];
  onScrollLock: (locked: boolean) => void;
  onHideMenu?: (hidden: boolean) => void;
  onCaptureSent?: () => void;
};

class CameraErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: "" }; }
  static getDerivedStateFromError(error: any) { return { hasError: true, error: error?.message ?? String(error) }; }
  componentDidCatch(error: any, info: any) { console.error("[CameraPage] Render error:", error, info?.componentStack); }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function compressWaveform(data: number[], maxBars: number): number[] {
  if (!data || data.length === 0) return [];
  if (data.length <= maxBars) return data;
  const result: number[] = [];
  const chunkSize = data.length / maxBars;
  for (let i = 0; i < maxBars; i++) {
    const start = Math.floor(i * chunkSize);
    const end = Math.floor((i + 1) * chunkSize);
    const slice = data.slice(start, end);
    const max = slice.reduce((m, val) => Math.max(m, val), 0);
    result.push(max);
  }
  return result;
}

function CameraPageInner({ groupId, userId, isActive, allGroups, onScrollLock, onHideMenu, onCaptureSent }: Props) {
  const insets = useSafeAreaInsets();
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const { colors } = useTheme();

  // Haut du cadre caméra (9/16, ancré en bas, au-dessus de la nav).
  // Sur tous les formats d'écran le bouton Défis sera à exactement CHALLENGE_GAP px sous ce bord.
  const cameraFrameTop = winHeight - NAVBAR_HEIGHT - winWidth * (16 / 9);
  const styles = useThemedStyles(makeStyles);
  const challengeStyles = useThemedStyles(makeChallengeStyles);
  const pickerStyles = useThemedStyles(makePickerStyles);
  const slotBarStyles = useThemedStyles(makeSlotBarStyles);
  const { startUpload, startChallengeUpload } = useUpload();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  useEffect(() => {
    if (!cameraPermission?.granted) requestCameraPermission();
  }, []);

  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [showChallengesModal, setShowChallengesModal] = useState(false);
  const [activeChallenge, setActiveChallenge] = useState<ActiveChallenge | null>(null);

  const drawingRef = useRef<DrawingCanvasRef>(null);
  const textInputRef = useRef<any>(null);
  const recordingTimer = useRef<NodeJS.Timeout | null>(null);
  const startTouchY = useRef<number | null>(null);
  const audioTimer = useRef<NodeJS.Timeout | null>(null);
  const isAudioRecordingRef = useRef(false);
  const audioProgressAnim = useRef(new Animated.Value(0)).current;
  const recordingSecondsRef = useRef(0);
  const seamlessRecorderRef = useRef<SeamlessRecorderRef>(null);
  const stopVideoRecordingRef = useRef<() => void>(() => {});
  const lastVolumeButtonTrigger = useRef(0);
  const lastVolumeRef = useRef(0);

  // Direct ref to onScrollLock for synchronous calls (bypass React state cycle)
  const onScrollLockRef = useRef(onScrollLock);
  useEffect(() => { onScrollLockRef.current = onScrollLock; }, [onScrollLock]);

  // Pinch-to-zoom + double-tap refs
  const savedZoomRef = useRef(0);
  const prevPinchDistRef = useRef<number | null>(null);
  const isPinchingLocalRef = useRef(false);
  const pinchRafRef = useRef<number | null>(null);
  const lastCameraTapRef = useRef(0);

  // Double-capture slots
  const [slot1, setSlot1] = useState<SlotData | null>(null);
  const [slot2, setSlot2] = useState<SlotData | null>(null);
  const [viewingSlot, setViewingSlot] = useState<1 | 2>(1);
  const [capturingSecond, setCapturingSecond] = useState(false);
  const capturingSecondRef = useRef(false);

  const [cameraMode, setCameraMode] = useState<CameraMode>("PHOTO");
  const [drawingColor, setDrawingColor] = useState("#FF561A");
  const [drawingStrokeWidth, setDrawingStrokeWidth] = useState(6);
  const [isDrawingActive, setIsDrawingActive] = useState(false);
  const [showColorPalette, setShowColorPalette] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [facing, setFacing] = useState<CameraType>("back");
  const [flash, setFlash] = useState<FlashMode>("off");
  const [zoom, setZoom] = useState(0);
  const [torch, setTorch] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isVideoProcessing, setIsVideoProcessing] = useState(false);
  const [isPinching, setIsPinching] = useState(false);
  const [isZoomDragging, setIsZoomDragging] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [textModeContent, setTextModeContent] = useState("");
  const [isAudioRecording, setIsAudioRecording] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [audioSeconds, setAudioSeconds] = useState(0);
  const [isCaptionRecording, setIsCaptionRecording] = useState(false);
  const isCaptionRecordingRef = useRef(false);
  const [captionAudioSeconds, setCaptionAudioSeconds] = useState(0);
  const captionAudioTimer = useRef<NodeJS.Timeout | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const isHoldRecordingRef = useRef<boolean>(false);
  const [isSwipingToCancel, setIsSwipingToCancel] = useState(false);
  const isSwipingToCancelRef = useRef(false);
  const cancelScaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(cancelScaleAnim, {
      toValue: isSwipingToCancel ? 1.3 : 1,
      useNativeDriver: true,
      tension: 100,
      friction: 7,
    }).start();
  }, [isSwipingToCancel]);

  const handleCaptionPressInRef = useRef<() => void>(() => {});
  const handleCaptionPressOutRef = useRef<() => void>(() => {});
  const cancelCaptionAudioRecordingRef = useRef<() => void>(() => {});

  useEffect(() => {
    handleCaptionPressInRef.current = handleCaptionPressIn;
    handleCaptionPressOutRef.current = handleCaptionPressOut;
    cancelCaptionAudioRecordingRef.current = cancelCaptionAudioRecording;
  });

  const captionPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5,
      onPanResponderGrant: () => {
        handleCaptionPressInRef.current();
      },
      onPanResponderMove: (_, gestureState) => {
        // Swipe to the left (negative dx) to cancel
        if (gestureState.dx < -80) {
          setIsSwipingToCancel(true);
          isSwipingToCancelRef.current = true;
        } else {
          setIsSwipingToCancel(false);
          isSwipingToCancelRef.current = false;
        }
      },
      onPanResponderRelease: () => {
        if (isSwipingToCancelRef.current) {
          cancelCaptionAudioRecordingRef.current();
        } else {
          handleCaptionPressOutRef.current();
        }
        setIsSwipingToCancel(false);
        isSwipingToCancelRef.current = false;
      },
      onPanResponderTerminate: () => {
        handleCaptionPressOutRef.current();
        setIsSwipingToCancel(false);
        isSwipingToCancelRef.current = false;
      },
    })
  ).current;

  // Derived state
  const isCapturing = slot1 === null || capturingSecond;
  const recapturingFirst = slot1 === null && slot2 !== null && !capturingSecond;
  const previewSlot = isCapturing ? null : (viewingSlot === 1 ? slot1 : slot2);
  const capturedAudioUri = previewSlot?.audioUri ?? null;
  const hasSlot2 = slot2 !== null;
  const isSlot1Preview = slot1 !== null && !capturingSecond && viewingSlot === 1 && !hasSlot2;
  const isSlot1WithSlot2 = slot1 !== null && !capturingSecond && viewingSlot === 1 && hasSlot2;
  const isSlot2Preview = slot1 !== null && !capturingSecond && viewingSlot === 2;
  const showBottomSlotBar = isSlot1Preview || isSlot1WithSlot2 || isSlot2Preview;
  const videoPreviewPlayer = useVideoPlayer(previewSlot?.mode === "VIDEO" ? (previewSlot.uri ?? null) : null, p => { p.loop = true; p.play(); });

  const audioWaveAnims = useRef(
    [350, 500, 280, 420, 320, 480, 360].map((duration, i) => ({
      anim: new Animated.Value(0.15),
      duration,
      delay: i * 60,
    }))
  ).current;

  const audioRecorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  
  const recorderState = useAudioRecorderState(audioRecorder, 120);

  const [recordedWaveform, setRecordedWaveform] = useState<number[]>([]);
  const [captionWaveform, setCaptionWaveform] = useState<number[]>([]);

  // 3.2s limit (approx 28 samples at 110ms-120ms interval logic seen in effects)
  const liveWaveform = (isCaptionRecording ? captionWaveform : recordedWaveform).slice(-28);

  // Collect metering data
  useEffect(() => {
    if (isAudioRecording && recorderState.metering !== undefined) {
      // Normalize metering (-160 to 0) to (0 to 1)
      const normalized = Math.max(0, (recorderState.metering + 40) / 40);
      setRecordedWaveform(prev => [...prev, normalized]);
    }
    if (isCaptionRecording && recorderState.metering !== undefined) {
      const normalized = Math.max(0, (recorderState.metering + 40) / 40);
      setCaptionWaveform(prev => [...prev, normalized]);
    }
  }, [recorderState.metering, isAudioRecording, isCaptionRecording]);

  const captionAudioUri = slot1?.captionAudioUri ?? null;
  const captionAudioPlayer = useAudioPlayer(captionAudioUri);
  const captionAudioStatus = useAudioPlayerStatus(captionAudioPlayer);

  const audioPreviewPlayer = useAudioPlayer(capturedAudioUri || null);
  const audioPreviewStatus = useAudioPlayerStatus(audioPreviewPlayer);
  const audioPreviewSeekRef = useRef<any>(null);
  const audioPreviewSeekLayoutRef = useRef({ pageX: 0, width: 1 });
  const audioPreviewDurationRef = useRef(0);
  const audioPreviewPlayerRef = useRef(audioPreviewPlayer);

  useEffect(() => { audioPreviewDurationRef.current = audioPreviewStatus.duration ?? 0; }, [audioPreviewStatus.duration]);
  useEffect(() => { audioPreviewPlayerRef.current = audioPreviewPlayer; }, [audioPreviewPlayer]);

  const audioPreviewPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt) => {
        const ratio = Math.max(0, Math.min(1, evt.nativeEvent.locationX / Math.max(1, audioPreviewSeekLayoutRef.current.width)));
        audioPreviewPlayerRef.current.seekTo(ratio * audioPreviewDurationRef.current);
      },
      onPanResponderMove: (evt) => {
        const relX = evt.nativeEvent.pageX - (evt.nativeEvent.pageX - evt.nativeEvent.locationX);
        const ratio = Math.max(0, Math.min(1, relX / Math.max(1, audioPreviewSeekLayoutRef.current.width)));
        audioPreviewPlayerRef.current.seekTo(ratio * audioPreviewDurationRef.current);
      },
    })
  ).current;

  useEffect(() => {
    const base = slot1 !== null || isPinching || isZoomDragging || isRecording;
    // Swipe entre les vues : verrouillé dès qu'on est en DESSIN (même sans dessiner).
    onScrollLock(base || cameraMode === "DESSIN");
    // Menu de l'app : masqué seulement en capture (en DESSIN : une fois qu'on dessine).
    onHideMenu?.(base || (cameraMode === "DESSIN" && canUndo));
  }, [slot1, isPinching, cameraMode, canUndo, isZoomDragging, isRecording]);

  useEffect(() => {
    if (cameraMode === "AUDIO" && isCapturing && !capturedAudioUri) {
      AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }).catch(() => {});
    } else {
      AudioModule.setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
  }, [cameraMode, isCapturing, capturedAudioUri]);

  useEffect(() => {
    return () => {
      if (recordingTimer.current !== null) {
        clearInterval(recordingTimer.current);
      }
    };
  }, []);

  // Keep savedZoomRef in sync when zoom changes externally (e.g. slider)
  useEffect(() => { savedZoomRef.current = zoom; }, [zoom]);

  // Reset torch when leaving VIDEO mode
  useEffect(() => { if (cameraMode !== "VIDEO") setTorch(false); }, [cameraMode]);



  // ── Slot helpers ──

  const saveToSlot = (data: SlotData) => {
    if (capturingSecondRef.current) {
      setSlot2(data);
      setCapturingSecond(false);
      capturingSecondRef.current = false;
      setViewingSlot(2);
    } else {
      setSlot1(data);
    }
  };

  const resetAll = () => {
    setSlot1(null);
    setSlot2(null);
    setViewingSlot(1);
    setCapturingSecond(false);
    capturingSecondRef.current = false;
    setTextModeContent("");
    setIsDrawingActive(false);
    setActiveChallenge(null);
    setZoom(0);
    savedZoomRef.current = 0;
  };

  const handleSelectChallenge = (challenge: ActiveChallenge) => {
    setActiveChallenge(challenge);
    setCameraMode(challenge.captureType as typeof cameraMode);
  };

  const handleTrash = () => {
    if (viewingSlot === 2) {
      setSlot2(null);
      setViewingSlot(1);
    } else {
      setSlot1(null);
      setCapturingSecond(false);
      capturingSecondRef.current = false;
      setTextModeContent("");
      setIsDrawingActive(false);
    }
  };

  const updateSlot1Note = (val: string) => {
    setSlot1(prev => prev ? { ...prev, note: val } : prev);
  };

  // Auto-save texte vers slot2 pendant la capture secondaire
  useEffect(() => {
    if (!capturingSecond || cameraMode !== "TEXTE") return;
    if (textModeContent.trim()) {
      setSlot2({ mode: "TEXTE", uri: null, audioUri: null, textContent: textModeContent.trim(), note: "" });
    } else {
      setSlot2(null);
    }
  }, [textModeContent, capturingSecond, cameraMode]);

  // ── Handlers ──

  const handleTouchStart = (e: any) => { startTouchY.current = e.nativeEvent.pageY; };
  const handleTouchMove = (e: any) => {
    if (!isRecording || startTouchY.current === null) return;
    const diff = startTouchY.current - e.nativeEvent.pageY;
    setZoom(Math.min(Math.max(diff / 300, 0), 1));
  };

  const startVideoRecording = async () => {
    if (isRecording) return;
    setIsRecording(true);
    setRecordingSeconds(0);
    recordingSecondsRef.current = 0;
    recordingTimer.current = setInterval(() => {
      setRecordingSeconds(s => {
        const next = s >= 14 ? s : s + 1;
        recordingSecondsRef.current = next;
        if (s >= 14) stopVideoRecordingRef.current();
        return next;
      });
    }, 1000);
    try {
      console.log("[CAM] startVideoRecording");
      await seamlessRecorderRef.current?.startRecording();
    } catch (e) {
      console.error("[CAM] startRecording error:", e);
      setIsRecording(false);
      if (recordingTimer.current) { clearInterval(recordingTimer.current); recordingTimer.current = null; }
    }
  };

  const stopVideoRecording = () => {
    if (recordingTimer.current === null && recordingSecondsRef.current === 0) return;
    if (recordingTimer.current) { clearInterval(recordingTimer.current); recordingTimer.current = null; }
    setIsRecording(false);
    setIsVideoProcessing(true);
    setRecordingSeconds(0);
    recordingSecondsRef.current = 0;
    console.log("[CAM] stopVideoRecording");
    seamlessRecorderRef.current?.stopRecording().then(uri => {
      if (uri) {
        console.log("[CAM] video saved:", uri.slice(-30));
        saveToSlot({ mode: "VIDEO", uri, audioUri: null, textContent: "", note: "" });
      }
      setIsVideoProcessing(false);
    }).catch(e => { setIsVideoProcessing(false); console.error("[CAM] stopRecording error:", e); });
  };
  stopVideoRecordingRef.current = stopVideoRecording;

  const handleFlipCamera = () => {
    setZoom(0);
    savedZoomRef.current = 0;
    setFacing(prev => prev === "back" ? "front" : "back");
    if (isRecording) seamlessRecorderRef.current?.switchCamera();
  };

  const handleFlipCameraRef = useRef(handleFlipCamera);
  handleFlipCameraRef.current = handleFlipCamera;

  // ── Pinch-to-zoom handlers (SeamlessRecorder container) ──
  const handleCamGrant = (e: any) => {
    if (e.nativeEvent.touches.length >= 2) {
      isPinchingLocalRef.current = true;
      prevPinchDistRef.current = null;
      setIsPinching(true);
    }
  };
  const handleCamMove = (e: any) => {
    const touches = e.nativeEvent.touches;
    if (touches.length < 2 || !isPinchingLocalRef.current) return;
    const dx = touches[1].pageX - touches[0].pageX;
    const dy = touches[1].pageY - touches[0].pageY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (prevPinchDistRef.current !== null) {
      const delta = dist - prevPinchDistRef.current;
      const next = Math.max(0, Math.min(1, savedZoomRef.current + delta * 0.003));
      savedZoomRef.current = next;
      if (pinchRafRef.current === null) {
        pinchRafRef.current = requestAnimationFrame(() => {
          setZoom(savedZoomRef.current);
          pinchRafRef.current = null;
        });
      }
    }
    prevPinchDistRef.current = dist;
  };
  const handleCamRelease = () => {
    if (isPinchingLocalRef.current) {
      isPinchingLocalRef.current = false;
      prevPinchDistRef.current = null;
      lastCameraTapRef.current = 0;
      if (pinchRafRef.current !== null) { cancelAnimationFrame(pinchRafRef.current); pinchRafRef.current = null; }
      setZoom(savedZoomRef.current);
      setIsPinching(false);
    }
  };
  const handleCamTerminate = () => {
    isPinchingLocalRef.current = false;
    prevPinchDistRef.current = null;
    if (pinchRafRef.current !== null) { cancelAnimationFrame(pinchRafRef.current); pinchRafRef.current = null; }
    setIsPinching(false);
  };
  const handleCamDoubleTap = () => {
    const now = Date.now();
    if (now - lastCameraTapRef.current < 350) {
      handleFlipCameraRef.current();
      lastCameraTapRef.current = 0;
    } else {
      lastCameraTapRef.current = now;
    }
  };

  const startAudioRecording = async () => {
    if (isAudioRecordingRef.current) return;
    isAudioRecordingRef.current = true;
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) { 
        isAudioRecordingRef.current = false;
        Alert.alert("Permission refusée", "L'accès au micro est requis."); 
        return; 
      }

      await AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync(RecordingPresets.LOW_QUALITY);
      
      // Delay to ensure native activity/audio state is ready on Android
      if (Platform.OS === "android") await new Promise(resolve => setTimeout(resolve, 150));
      
      // Check if we were stopped in the meantime
      if (!isAudioRecordingRef.current) {
        await audioRecorder.stop().catch(() => {});
        return;
      }

      await audioRecorder.record();
      setRecordedWaveform([]);
      setIsAudioRecording(true);
      setAudioSeconds(0);
      audioProgressAnim.setValue(0);
      Animated.timing(audioProgressAnim, { toValue: 1, duration: 30000, easing: Easing.linear, useNativeDriver: false }).start();
      audioTimer.current = setInterval(() => setAudioSeconds(s => s + 1), 1000);
      setTimeout(() => { if (isAudioRecordingRef.current) stopAudioRecordingDirect(); }, 30000);
      audioWaveAnims.forEach(({ anim, duration, delay }) => {
        Animated.loop(Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.15, duration, useNativeDriver: true }),
        ])).start();
      });
    } catch (e: any) {
      console.error("Erreur startAudioRecording:", e);
      isAudioRecordingRef.current = false;
      setIsAudioRecording(false);
      Alert.alert("Erreur", `Impossible de démarrer l'enregistrement : ${e.message || e.toString()}`);
    }
  };

  const stopAudioRecordingDirect = async () => {
    if (!isAudioRecordingRef.current && !isAudioRecording) return;
    isAudioRecordingRef.current = false;
    try { 
      await audioRecorder.stop(); 
    } catch (e) {
      console.error("Error stopping recording:", e);
    }
    if (audioTimer.current) { clearInterval(audioTimer.current); audioTimer.current = null; }
    audioProgressAnim.stopAnimation();
    audioWaveAnims.forEach(({ anim }) => { anim.stopAnimation(); anim.setValue(0.15); });
    setIsAudioRecording(false);
    if (audioRecorder.uri) {
      saveToSlot({ mode: "AUDIO", uri: null, audioUri: audioRecorder.uri, textContent: "", note: "", waveform: recordedWaveform });
    }
  };

  const stopAudioRecording = stopAudioRecordingDirect;

  const startCaptionAudioRecording = async () => {
    if (isCaptionRecordingRef.current) return;
    isCaptionRecordingRef.current = true;
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) { 
        isCaptionRecordingRef.current = false;
        Alert.alert("Permission refusée", "L'accès au micro est requis."); 
        return; 
      }

      await AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
      
      // Delay for Android activity sync
      if (Platform.OS === "android") await new Promise(resolve => setTimeout(resolve, 150));

      if (!isCaptionRecordingRef.current) {
        await audioRecorder.stop().catch(() => {});
        return;
      }

      await audioRecorder.record();
      setCaptionWaveform([]);
      setIsCaptionRecording(true);
      setCaptionAudioSeconds(0);
      captionAudioTimer.current = setInterval(() => setCaptionAudioSeconds(s => s + 1), 1000);
      audioWaveAnims.forEach(({ anim, duration, delay }) => {
        Animated.loop(Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.15, duration, useNativeDriver: true }),
        ])).start();
      });
    } catch (e: any) {
      console.error("Erreur startCaptionAudioRecording:", e);
      isCaptionRecordingRef.current = false;
      setIsCaptionRecording(false);
    }
  };

  const stopCaptionAudioRecording = async () => {
    if (!isCaptionRecordingRef.current && !isCaptionRecording) return;
    isCaptionRecordingRef.current = false;
    try { 
      await audioRecorder.stop(); 
    } catch (e) {
      console.error("Error stopping caption recording:", e);
    }
    if (captionAudioTimer.current) { clearInterval(captionAudioTimer.current); captionAudioTimer.current = null; }
    audioWaveAnims.forEach(({ anim }) => { anim.stopAnimation(); anim.setValue(0.15); });
    setIsCaptionRecording(false);
    if (audioRecorder.uri) {
      setSlot1(prev => prev ? { ...prev, captionAudioUri: audioRecorder.uri, captionWaveform } : prev);
    }
  };

  const handleAudioPressIn = () => {
    if (isAudioRecordingRef.current) {
      stopAudioRecordingDirect();
      return;
    }
    isHoldRecordingRef.current = false;
    recordingStartTimeRef.current = Date.now();
    startAudioRecording();
  };

  const handleAudioPressOut = () => {
    if (isAudioRecordingRef.current) {
      const duration = Date.now() - recordingStartTimeRef.current;
      if (duration > 400) {
        isHoldRecordingRef.current = true;
        stopAudioRecordingDirect();
      }
    }
  };

  const handleCaptionPressIn = () => {
    if (isCaptionRecordingRef.current) {
      stopCaptionAudioRecording();
      return;
    }
    isHoldRecordingRef.current = false;
    recordingStartTimeRef.current = Date.now();
    startCaptionAudioRecording();
  };

  const handleCaptionPressOut = () => {
    if (isCaptionRecordingRef.current) {
      const duration = Date.now() - recordingStartTimeRef.current;
      if (duration > 400) {
        isHoldRecordingRef.current = true;
        stopCaptionAudioRecording();
      }
    }
  };

  const cancelCaptionAudioRecording = async () => {
    if (!isCaptionRecordingRef.current && !isCaptionRecording) return;
    isCaptionRecordingRef.current = false;
    try {
      await audioRecorder.stop();
    } catch (e) {
      console.error("Error cancelling caption recording:", e);
    }
    if (captionAudioTimer.current) { clearInterval(captionAudioTimer.current); captionAudioTimer.current = null; }
    audioWaveAnims.forEach(({ anim }) => { anim.stopAnimation(); anim.setValue(0.15); });
    setIsCaptionRecording(false);
  };

  const handleCapture = async () => {
    if (cameraMode === "TEXTE") {
      if (!textModeContent.trim()) return;
      saveToSlot({ mode: "TEXTE", uri: null, audioUri: null, textContent: textModeContent.trim(), note: "" });
      return;
    }
    if (cameraMode === "AUDIO") {
      if (isAudioRecording) await stopAudioRecording();
      else await startAudioRecording();
      return;
    }
    if (cameraMode === "DESSIN") {
      // Envoie le dessin (uniquement s'il y a au moins un trait).
      if (!canUndo || !drawingRef.current) return;
      setCapturing(true);
      try {
        const uri = await drawingRef.current.capture();
        if (uri) saveToSlot({ mode: "DESSIN", uri, audioUri: null, textContent: "", note: "" });
      } finally { setCapturing(false); }
      return;
    }
    if (cameraMode === "VIDEO") {
      if (isRecording) stopVideoRecording(); else startVideoRecording();
      return;
    }
    // SeamlessRecorder gère la photo sur iOS et Android
    if (capturing) return;
    if (isRecording) return;
    setCapturing(true);
    try {
      const uri = await seamlessRecorderRef.current?.capturePhoto();
      if (uri) {
        let finalUri = uri;
        if (facing === "front") {
          const result = await manipulateAsync(uri, [{ flip: FlipType.Horizontal }], { compress: 1, format: SaveFormat.JPEG });
          finalUri = result.uri;
        }
        saveToSlot({ mode: "PHOTO", uri: finalUri, audioUri: null, textContent: "", note: "" });
      }
    } catch (e: any) {
      console.error("Capture error:", e);
      Alert.alert("Erreur", "Impossible de prendre la photo.");
    } finally { setCapturing(false); }
  };

  const openGroupPicker = () => {
    if (activeChallenge !== null) { confirmUpload([activeChallenge.groupId]); return; }
    if (allGroups.length <= 1) { confirmUpload([groupId]); return; }
    setSelectedGroupIds([groupId]);
    setShowGroupPicker(true);
  };

  // ── Volume button capture ──
  const handleCaptureRef = useRef(handleCapture);
  handleCaptureRef.current = handleCapture;
  const isCapturingRef = useRef(isCapturing);
  isCapturingRef.current = isCapturing;
  const capturingRef = useRef(capturing);
  capturingRef.current = capturing;
  const cameraModeRef = useRef(cameraMode);
  cameraModeRef.current = cameraMode;

  useEffect(() => {
    if (!isActive) return;

    if (Platform.OS === "ios") {
      // iOS specific configuration for hardware button interception
      VolumeManager.enable(true, true).catch(() => {});
      VolumeManager.setActive(true, true).catch(() => {});
      VolumeManager.setCategory("ambient", true).catch(() => {});
      VolumeManager.enableInSilenceMode(true).catch(() => {});
    }

    const handleVolume = async (newVolume?: any) => {
      try {
        const result = newVolume ?? (await VolumeManager.getVolume());
        const volume = result?.volume ?? 0;
        
        // Use a small epsilon for float comparison
        const isUp = volume > (lastVolumeRef.current + 0.001);
        
        if (volume >= 0.98) {
          // On iOS, resetting needs to be very explicit
          const resetVol = 0.94 - (Math.random() * 0.05);
          await VolumeManager.setVolume(resetVol, { showUI: false }).catch(() => {});
          lastVolumeRef.current = resetVol;
        } else {
          lastVolumeRef.current = volume;
        }
        
        return isUp;
      } catch (e) {
        return false;
      }
    };

    // Initial sync
    VolumeManager.getVolume().then(res => {
      if (res && typeof res.volume === 'number') {
        lastVolumeRef.current = res.volume;
        // If already at max, reset immediately so the first press works
        if (res.volume >= 0.98) {
          VolumeManager.setVolume(0.94).catch(() => {});
          lastVolumeRef.current = 0.94;
        }
      }
    }).catch(() => {});

    const volumeListener = VolumeManager.addVolumeListener(async (result) => {
      // Process volume change
      const wasVolumeUp = await handleVolume(result);

      if (!wasVolumeUp) return;

      const now = Date.now();
      if (now - lastVolumeButtonTrigger.current < 500) return;

      if (isActive && isCapturingRef.current && !capturingRef.current) {
        if (cameraModeRef.current === "PHOTO" || cameraModeRef.current === "VIDEO") {
          lastVolumeButtonTrigger.current = now;
          handleCaptureRef.current();
        }
      }
    });

    VolumeManager.showNativeVolumeUI({ enabled: false });

    return () => {
      volumeListener.remove();
      VolumeManager.showNativeVolumeUI({ enabled: true });
      if (Platform.OS === "ios") {
        VolumeManager.setActive(false, true).catch(() => {});
        VolumeManager.enable(false, true).catch(() => {});
      }
    };
  }, [isActive]);

  const toggleGroup = (id: string) => {
    setSelectedGroupIds(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
  };

  const confirmUpload = (groupIds: string[]) => {
    if (!slot1) return;
    const ts = Date.now();
    groupIds.forEach((gId, i) => {
      // Primary file (slot1)
      let fileName: string | null = null;
      let fileUri: string | null = null;
      let contentType: string | null = null;
      let dbNote: string | null = null;

      if (slot1.mode === "TEXTE") {
        dbNote = slot1.textContent;
      } else if (slot1.mode === "AUDIO" && slot1.audioUri) {
        fileName = `${gId}/${userId}_${ts + i}.m4a`;
        fileUri = slot1.audioUri;
        contentType = "audio/m4a";
        dbNote = slot1.note.trim() || null;
      } else if (slot1.mode === "VIDEO" && slot1.uri) {
        fileName = `${gId}/${userId}_${ts + i}.mp4`;
        fileUri = slot1.uri;
        contentType = "video/mp4";
        dbNote = slot1.note.trim() || null;
      } else if ((slot1.mode === "PHOTO" || slot1.mode === "DESSIN") && slot1.uri) {
        const suffix = slot1.mode === "DESSIN" ? "_draw" : "";
        fileName = `${gId}/${userId}_${ts + i}${suffix}.jpg`;
        fileUri = slot1.uri;
        contentType = "image/jpeg";
        dbNote = slot1.note.trim() || null;
      }

      const dbData = { group_id: gId, user_id: userId, note: dbNote };

      // Caption Audio
      let captionAudioFile = null;
      if (slot1.captionAudioUri) {
        captionAudioFile = {
          fileName: `${gId}/${userId}_${ts + i}_caption.m4a`,
          fileUri: slot1.captionAudioUri,
          contentType: "audio/m4a"
        };
      }

      // Secondary file (slot2)
      let secondFile = null;
      if (slot2) {
        if (slot2.mode === "TEXTE") {
          secondFile = { fileName: null, fileUri: null, contentType: null };
        } else if (slot2.mode === "AUDIO" && slot2.audioUri) {
          secondFile = { fileName: `${gId}/${userId}_${ts + i + 1000}.m4a`, fileUri: slot2.audioUri, contentType: "audio/m4a" };
        } else if (slot2.mode === "VIDEO" && slot2.uri) {
          secondFile = { fileName: `${gId}/${userId}_${ts + i + 1000}.mp4`, fileUri: slot2.uri, contentType: "video/mp4" };
        } else if ((slot2.mode === "PHOTO" || slot2.mode === "DESSIN") && slot2.uri) {
          const suffix2 = slot2.mode === "DESSIN" ? "_draw" : "";
          secondFile = { fileName: `${gId}/${userId}_${ts + i + 1000}${suffix2}.jpg`, fileUri: slot2.uri, contentType: "image/jpeg" };
        }
      }

      if (activeChallenge !== null) {
        startChallengeUpload(
          activeChallenge.challengeId,
          fileName, fileUri, contentType,
          { group_id: gId, user_id: userId, note: dbNote },
          secondFile ?? undefined,
          activeChallenge.isTarget,
          slot1.waveform
        );
      } else {
        startUpload(fileName, fileUri, contentType, dbData, secondFile ?? undefined, captionAudioFile ?? undefined, slot1.waveform, slot1.captionWaveform);
      }
    });
    onCaptureSent?.();
    resetAll();
  };

  const handleConfirmGroupPicker = () => {
    if (selectedGroupIds.length === 0) return;
    setShowGroupPicker(false);
    confirmUpload(selectedGroupIds);
  };

  // ── Slot thumbnail renderer ──

  const renderSlotThumbnail = (slot: SlotData) => {
    if (slot.mode === "PHOTO" || slot.mode === "DESSIN") {
      return <Image source={{ uri: slot.uri ?? "" }} style={StyleSheet.absoluteFillObject as any} contentFit="cover" />;
    }
    if (slot.mode === "VIDEO" && slot.uri) {
      return <VideoSlotThumbnail uri={slot.uri} borderRadius={16} />;
    }
    if (slot.mode === "AUDIO") {
      return (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#1A1A1A", justifyContent: "center", alignItems: "center" }]}>
          <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <Path d="M19 10v2a7 7 0 0 1-14 0v-2" /><Path d="M12 19v4" /><Path d="M8 23h8" />
          </Svg>
        </View>
      );
    }
    // TEXTE
    return (
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#1A1A1A", justifyContent: "center", alignItems: "center", padding: 6 }]}>
        <Text style={{ color: colors.text, fontSize: typography.size.xs, fontFamily: typography.family.semibold }} numberOfLines={2}>{slot.textContent}</Text>
      </View>
    );
  };

  // ── Render ──

  return (
    <>
      {/* ── Camera / capture views ── */}
      {isCapturing && (
        cameraMode === "TEXTE" ? (
          <KeyboardAvoidingView
            style={[styles.textModeContainer, { paddingTop: Math.max(insets.top, 12) + 48 }]}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0}
          >
            <Pressable style={{ flex: 1, width: "100%" }} onPress={() => textInputRef.current?.focus()}>
              <TextInput
                ref={textInputRef}
                style={[styles.textModeInput, { fontSize: textModeContent.length <= 120 ? 32 : textModeContent.length <= 260 ? 26 : textModeContent.length <= 450 ? 21 : textModeContent.length <= 650 ? 17 : 14 }]}
                placeholder="Écris..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                multiline
                value={textModeContent}
                onChangeText={setTextModeContent}
                autofocus="off"
                textAlignVertical="top"
                pointerEvents="auto"
              />
            </Pressable>
          </KeyboardAvoidingView>
        ) : cameraMode === "DESSIN" ? (
          <View style={[styles.cameraPageContainer, { justifyContent: "flex-end", paddingTop: 0, paddingBottom: NAVBAR_HEIGHT, paddingHorizontal: 0 }]}>
            <View style={styles.drawingArea}>
              <DrawingCanvas ref={drawingRef} color={drawingColor} strokeWidth={drawingStrokeWidth} onHistoryChange={(u, r) => { setCanUndo(u); setCanRedo(r); }} />

              {/* Croix (fermer / annuler le dessin) — haut-gauche, dès qu'on a dessiné */}
              {canUndo && (
                <TouchableOpacity style={styles.drawingCloseBtn} onPress={() => drawingRef.current?.clear()} activeOpacity={0.8}>
                  <CloseIcon />
                </TouchableOpacity>
              )}

              {/* Colonne haut-droite : couleur / annuler / corbeille (sibling du canvas → tap OK) */}
              <View style={styles.cameraControls}>
                <View>
                  <TouchableOpacity style={styles.cameraCtrlBtn} onPress={() => setShowColorPalette((s) => !s)} activeOpacity={0.8}>
                    <BlurView intensity={glassBlurIntensity} tint="dark" blurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} pointerEvents="none" />
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.opacityLight }]} pointerEvents="none" />
                    <View style={[styles.colorDot, { backgroundColor: drawingColor }]} />
                  </TouchableOpacity>
                  {showColorPalette && (
                    <View style={styles.colorPalette}>
                      <BlurView intensity={glassBlurIntensity} tint="dark" blurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} pointerEvents="none" />
                      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.opacityLight }]} pointerEvents="none" />
                      {DRAWING_COLORS.map((row, ri) => (
                        <View key={ri} style={styles.colorPaletteRow}>
                          {row.map((c) => (
                            <TouchableOpacity
                              key={c}
                              onPress={() => { setDrawingColor(c); setShowColorPalette(false); }}
                              style={[styles.colorSwatch, { backgroundColor: c }, drawingColor.toUpperCase() === c && styles.colorSwatchSelected]}
                            />
                          ))}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <TouchableOpacity style={styles.cameraCtrlBtn} onPress={() => drawingRef.current?.undo()} activeOpacity={0.8} disabled={!canUndo}>
                  <BlurView intensity={glassBlurIntensity} tint="dark" blurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} pointerEvents="none" />
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.opacityLight }]} pointerEvents="none" />
                  <Icon name="rollback" size={20} color={canUndo ? colors.icon : colors.iconDisabled} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.cameraCtrlBtn} onPress={() => setShowClearConfirm(true)} activeOpacity={0.8} disabled={!canUndo}>
                  <BlurView intensity={glassBlurIntensity} tint="dark" blurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} pointerEvents="none" />
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.opacityLight }]} pointerEvents="none" />
                  <Icon name="trash" size={20} color={canUndo ? colors.icon : colors.iconDisabled} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : cameraMode === "AUDIO" ? (
          <View style={styles.audioModeContainer}>
            <TouchableOpacity
              style={styles.audioIdleTouchable}
              onPressIn={handleAudioPressIn}
              onPressOut={handleAudioPressOut}
              activeOpacity={0.7}
            >
              {isAudioRecording ? (
                <>
                  <View style={[styles.audioProgressBar, { top: insets.top + 8 }]}>
                    <Animated.View style={[styles.audioProgressFill, { width: audioProgressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
                  </View>
                  <View style={styles.audioRecordingIndicator}>
                    <View style={styles.audioRedDot} />
                    <Text style={styles.audioTimerText}>{audioSeconds}s / 30s</Text>
                  </View>
                  <View style={[styles.audioWaveformRow, { width: "100%", paddingHorizontal: 20 }]} pointerEvents="none">
                    {liveWaveform.map((v, i) => (
                      <View key={i} style={[styles.audioWaveformBar, { height: Math.max(3.5, v * 40) }]} />
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <Svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <Path d="M19 10v2a7 7 0 0 1-14 0v-2" /><Path d="M12 19v4" /><Path d="M8 23h8" />
                  </Svg>
                  <Text style={styles.audioHintText}>Maintiens pour enregistrer</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.cameraPageContainer, { justifyContent: "flex-end", paddingTop: 0, paddingBottom: (capturingSecond && slot1) ? NAVBAR_HEIGHT + 92 : NAVBAR_HEIGHT, paddingHorizontal: 0 }]}>
            <View style={styles.cameraInner}>
              <>
                {/* Camera view clipped to rounded rect — only mount when permission is granted */}
                <View style={[StyleSheet.absoluteFillObject, { borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, overflow: "hidden" }]}>
                  {(cameraPermission?.granted ?? Platform.OS === "ios") && (
                    <SeamlessRecorder
                      ref={seamlessRecorderRef}
                      facing={facing}
                      flash={flash === 'torch' ? 'on' : flash as 'off' | 'on' | 'auto'}
                      zoom={zoom}
                      torch={cameraMode === "VIDEO" ? torch : false}
                      videoMode={cameraMode === "VIDEO"}
                      style={StyleSheet.absoluteFillObject}
                    />
                  )}
                </View>
                {/* Pinch-to-zoom (parent captures 2-finger before child Pressable sees them) */}
                <View
                  style={StyleSheet.absoluteFillObject}
                  onStartShouldSetResponderCapture={(e) => e.nativeEvent.touches.length >= 2}
                  onMoveShouldSetResponderCapture={(e) => isPinchingLocalRef.current && e.nativeEvent.touches.length >= 2}
                  onResponderGrant={handleCamGrant}
                  onResponderMove={handleCamMove}
                  onResponderRelease={handleCamRelease}
                  onResponderTerminate={handleCamTerminate}
                  onResponderTerminationRequest={() => !isPinchingLocalRef.current}
                >
                  {/* Double-tap to flip — inside pinch view so 2-finger is intercepted above */}
                  <Pressable style={StyleSheet.absoluteFillObject} onPress={handleCamDoubleTap} />
                </View>
              </>
              {/* Contrôles caméra (colonne haut-droite) : flash / rotate / zoom */}
              {(cameraMode === "PHOTO" || cameraMode === "VIDEO") && !isRecording && (
                <View style={styles.cameraControls}>
                  <CameraControlButton
                    icon="flash"
                    onPress={() => {
                      if (cameraMode === "VIDEO") setTorch(t => !t);
                      else setFlash(prev => prev === "off" ? "on" : prev === "on" ? "auto" : "off");
                    }}
                  />
                  <CameraControlButton icon="rotate" onPress={handleFlipCamera} />
                  <CameraControlButton icon="zoom" onPress={() => {}} />
                </View>
              )}
            </View>
          </View>
        )
      )}

      {/* ── Écran traitement vidéo supprimé (SeamlessRecorder = zéro post-processing) ── */}
      {false && (
        <View style={[styles.previewContainer, { paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: NAVBAR_HEIGHT + 8, paddingHorizontal: 12 }]}>
          <View style={[styles.previewImageWrapper, { backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", gap: 16 }]}>
            <ActivityIndicator size="large" color={colors.text} />
            <Text style={styles.processingText}>Traitement…</Text>
          </View>
          <View style={[slotBarStyles.bar, { opacity: 0.35 }]} pointerEvents="none">
            <View style={slotBarStyles.addBtn}>
              <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <Path d="M12 5V19" stroke={colors.bg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <Path d="M5 12H19" stroke={colors.bg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </Svg>
              <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <Path d="M20 9H11C9.89543 9 9 9.89543 9 11V20C9 21.1046 9.89543 22 11 22H20C21.1046 22 20 21.1046 22 20V11C22 9.89543 21.1046 9 20 9Z" stroke={colors.bg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <Path d="M5 15H4C3.46957 15 2.96086 14.7893 2.58579 14.4142C2.21071 14.0391 2 13.5304 2 13V4C2 3.46957 2.21071 2.96086 2.58579 2.58579C2.96086 2.21071 3.46957 2 4 2H13C13.5304 2 14.0391 2.21071 14.4142 2.58579C14.7893 2.96086 15 3.46957 15 4V5" stroke={colors.bg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </Svg>
            </View>
            <View style={slotBarStyles.sendBtn}>
              <SendIcon color={colors.bg} />
              <Text style={slotBarStyles.sendText}>Envoyer</Text>
            </View>
          </View>
        </View>
      )}

      {/* ── Camera UI overlay ── */}
      {isCapturing && (
        <View style={styles.fill} pointerEvents="box-none">
          {/* Challenge top area (button or active banner) */}
          {!capturingSecond && !isRecording && !(cameraMode === "DESSIN" && canUndo) && (
            activeChallenge === null ? (
              <View style={[challengeStyles.topContainer, { paddingTop: cameraFrameTop + CHALLENGE_GAP }]} pointerEvents="box-none">
                <TouchableOpacity
                  style={challengeStyles.challengeBtn}
                  onPress={() => setShowChallengesModal(true)}
                  activeOpacity={0.8}
                >
                  <Text style={challengeStyles.challengeBtnText}>Défis</Text>
                  <Shape name="dessin" size={20} color={colors.iconBrandOnBrandSecondary} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[challengeStyles.topContainer, { top: cameraFrameTop, left: 12, right: 12 }]} pointerEvents="box-none">
                <View style={challengeStyles.bannerRow} pointerEvents="box-none">
                  <TouchableOpacity
                    style={challengeStyles.bannerClose}
                    onPress={() => setActiveChallenge(null)}
                    activeOpacity={0.7}
                  >
                    <Svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <Path d="M18 6L6 18M6 6l12 12" stroke={colors.text} strokeWidth="2.5" strokeLinecap="round" />
                    </Svg>
                  </TouchableOpacity>
                  <View style={challengeStyles.bannerTextWrapper}>
                    <Text style={challengeStyles.bannerText} numberOfLines={2}>{activeChallenge.promptText}</Text>
                    {activeChallenge.proposedByUsername && (
                      <Text style={challengeStyles.bannerProposerText}>↳ {activeChallenge.proposedByUsername}</Text>
                    )}
                  </View>
                </View>
              </View>
            )
          )}

          {isRecording && (
            <View style={[styles.recordingTimer, { top: Math.max(insets.top, 40) }]}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>{recordingSeconds}s / 15s</Text>
            </View>
          )}

          <View style={[styles.cameraFooter, { bottom: (capturingSecond && slot1) ? NAVBAR_HEIGHT + 104 : NAVBAR_HEIGHT + 24 }]}>
            <View style={{ alignItems: "center", gap: 6 }}>
              {(cameraMode === "PHOTO" || cameraMode === "VIDEO") && (
                <ZoomSlider zoom={zoom} onZoom={(z) => { setZoom(z); savedZoomRef.current = z; }} onDragStart={() => { setIsZoomDragging(true); onScrollLockRef.current(true); }} onDragEnd={() => setIsZoomDragging(false)} />
              )}
              {(activeChallenge === null || capturingSecond) && !isRecording && !isAudioRecording && !(cameraMode === "DESSIN" && canUndo) && (
                <ModeSelector
                  selected={cameraMode}
                  onSelect={(m) => { setCameraMode(m); }}
                />
              )}
            </View>

            <View style={styles.captureRow}>
              {cameraMode !== "TEXTE" && <View style={styles.sideControlPlaceholder} />}
              {!(capturingSecond && cameraMode === "TEXTE") && <TouchableOpacity
                style={styles.captureBtn}
                onPress={handleCapture}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                disabled={isPinching || (cameraMode === "TEXTE" && !textModeContent.trim())}
                activeOpacity={0.8}
              >
                <BlurView intensity={glassBlurIntensity} tint="dark" blurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.opacityLight }]} />
                {isRecording || isAudioRecording ? (
                  <Shape name="stop" size={40} color={colors.brand} />
                ) : cameraMode === "VIDEO" || cameraMode === "PHOTO" || cameraMode === "DESSIN" ? (
                  <Shape name={cameraMode === "VIDEO" ? "video" : cameraMode === "PHOTO" ? "photo" : "dessin"} size={48} color={colors.brand} />
                ) : null}
              </TouchableOpacity>}
              {cameraMode !== "TEXTE" && <View style={styles.sideControlPlaceholder} />}
            </View>
          </View>
          {/* ── Barre switch/envoyer pendant la 2e capture ── */}
          {capturingSecond && slot1 && !(cameraMode === "DESSIN" && canUndo) && (
            <View style={[styles.capturingSecondBar, { bottom: NAVBAR_HEIGHT + 8 }]}>
              <TouchableOpacity
                style={styles.capturingSecondThumb}
                onPress={() => { setCapturingSecond(false); capturingSecondRef.current = false; setViewingSlot(1); }}
                activeOpacity={0.8}
              >
                {renderSlotThumbnail(slot1)}
                <View style={[slotBarStyles.badge, { top: 6, right: 6 }]}><Text style={slotBarStyles.badgeText}>1</Text></View>
                <View style={slotBarStyles.swapOverlay}>
                  <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M7 16V4m0 0L3 8m4-4l4 4" /><Path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
                  </Svg>
                </View>
              </TouchableOpacity>
              {cameraMode === "TEXTE" && slot2 && (
                <TouchableOpacity style={slotBarStyles.sendBtn} onPress={openGroupPicker}>
                  <SendIcon color={colors.bg} />
                  <Text style={slotBarStyles.sendText}>Envoyer</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {isVideoProcessing && (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} pointerEvents="box-none" />
          )}
        </View>
      )}

      {/* ── Preview: Photo / Drawing / Text ── */}
      {!isCapturing && isActive && previewSlot && previewSlot.mode !== "AUDIO" && (
        <View style={[styles.previewContainer, { paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: NAVBAR_HEIGHT + 8, paddingHorizontal: 12 }]}>
          {previewSlot.mode === "TEXTE" ? (
            <View style={[styles.previewImageWrapper, { backgroundColor: "#0A0A0A" }]}>
              {activeChallenge !== null && (
                <View style={challengeStyles.previewBannerOverlay} pointerEvents="box-none">
                  <View style={challengeStyles.bannerRow}>
                    <TouchableOpacity style={challengeStyles.bannerClose} onPress={() => setActiveChallenge(null)} activeOpacity={0.7}>
                      <Svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <Path d="M18 6L6 18M6 6l12 12" stroke={colors.text} strokeWidth="2.5" strokeLinecap="round" />
                      </Svg>
                    </TouchableOpacity>
                    <View style={challengeStyles.bannerTextWrapper}>
                      <Text style={challengeStyles.bannerText} numberOfLines={2}>{activeChallenge.promptText}</Text>
                      {activeChallenge.proposedByUsername && (
                        <Text style={challengeStyles.bannerProposerText}>↳ {activeChallenge.proposedByUsername}</Text>
                      )}
                    </View>
                  </View>
                </View>
              )}
              <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
                <Text style={{ color: colors.text, fontFamily: typography.family.bold, textAlign: "center", fontSize: previewSlot.textContent.length <= 120 ? 32 : previewSlot.textContent.length <= 260 ? 26 : previewSlot.textContent.length <= 450 ? 21 : 17 }}>
                  {previewSlot.textContent}
                </Text>
              </View>
              <View style={[styles.previewTopBtns, activeChallenge !== null && { top: 70 }]}>
                <TouchableOpacity style={styles.topSquareBtn} onPress={resetAll}><CloseIcon /></TouchableOpacity>
                {hasSlot2 && <TouchableOpacity style={styles.topSquareBtn} onPress={handleTrash}><TrashIcon /></TouchableOpacity>}
              </View>
              {viewingSlot === 1 && (
                <View style={[styles.previewContent, { bottom: 24 }]}>
                  {activeChallenge === null && (
                    <View style={{ gap: 12 }}>
                      <View style={styles.combinedInputContainer}>
                        <BlurView intensity={blur.md} tint="dark" style={StyleSheet.absoluteFillObject} />
                        {slot1!.captionAudioUri ? (
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <AudioCaptionPlayer 
                              player={captionAudioPlayer} 
                              status={captionAudioStatus} 
                              showVocalLabel 
                              onRemove={() => setSlot1(prev => prev ? { ...prev, captionAudioUri: null } : prev)} 
                              waveform={slot1!.captionWaveform}
                            />
                          </View>
                        ) : (
                          <>
                            {isCaptionRecording ? (
                              <View style={styles.recordingContainer}>
                                <TouchableOpacity
                                  style={{ paddingRight: 12 }}
                                  onPress={cancelCaptionAudioRecordingRef.current}
                                  activeOpacity={0.7}
                                >
                                  <View style={styles.captionIconContainer}>
                                    <BlurView intensity={blur.md} tint="dark" style={StyleSheet.absoluteFillObject} />
                                    <Animated.View style={{ transform: [{ scale: cancelScaleAnim }] }}>
                                      <Icon name="x" size={20} color={isSwipingToCancel ? colors.iconDangerTertiary : colors.white} />
                                    </Animated.View>
                                  </View>
                                </TouchableOpacity>
                                <View style={styles.captionRecordingOverlay}>
                                  <View style={[styles.audioWaveformRow, { flex: 1 }]} pointerEvents="none">
                                    {liveWaveform.map((v, i) => (
                                      <View key={i} style={[styles.audioWaveformBar, { height: Math.max(3.5, v * 40), backgroundColor: colors.white }]} />
                                    ))}
                                  </View>
                                  <Text style={styles.captionRecordingText}>{captionAudioSeconds}s</Text>
                                </View>
                              </View>
                            ) : (
                              <TouchableOpacity style={styles.previewNoteBox} onPress={() => setIsEditingNote(true)} activeOpacity={0.7}>
                                {slot1!.note ? (
                                  <Text style={styles.previewNoteText} numberOfLines={1}>{slot1!.note}</Text>
                                ) : (
                                  <Text style={styles.addNoteBtnText}>Ajouter une légende...</Text>
                                )}
                              </TouchableOpacity>
                            )}

                            <View
                              style={[isCaptionRecording ? styles.captionStopBtn : styles.captionRecordBtn, isSwipingToCancel && { opacity: 0.5 }]}
                              {...captionPanResponder.panHandlers}
                            >
                              <View style={styles.captionIconContainer}>
                                <BlurView intensity={blur.md} tint="dark" style={StyleSheet.absoluteFillObject} />
                                {isCaptionRecording ? (
                                  <Icon name="check" size={20} color={colors.text} />
                                ) : (
                                  <Icon name="mic" size={20} color={colors.text} />
                                )}
                              </View>
                            </View>
                          </>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.previewImageWrapper, previewSlot.mode === "DESSIN" && { backgroundColor: colors.bg }]}>
              {activeChallenge !== null && (
                <View style={challengeStyles.previewBannerOverlay} pointerEvents="box-none">
                  <View style={challengeStyles.bannerRow}>
                    <TouchableOpacity style={challengeStyles.bannerClose} onPress={() => setActiveChallenge(null)} activeOpacity={0.7}>
                      <Svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <Path d="M18 6L6 18M6 6l12 12" stroke={colors.text} strokeWidth="2.5" strokeLinecap="round" />
                      </Svg>
                    </TouchableOpacity>
                    <View style={challengeStyles.bannerTextWrapper}>
                      <Text style={challengeStyles.bannerText} numberOfLines={2}>{activeChallenge.promptText}</Text>
                      {activeChallenge.proposedByUsername && (
                        <Text style={challengeStyles.bannerProposerText}>↳ {activeChallenge.proposedByUsername}</Text>
                      )}
                    </View>
                  </View>
                </View>
              )}
              {previewSlot.mode === "DESSIN" ? (
                <View style={styles.drawingPreviewCenter}>
                  <Image source={{ uri: previewSlot.uri ?? "" }} style={styles.drawingPreviewImage} contentFit="fill" />
                </View>
              ) : previewSlot.mode === "VIDEO" ? (
                <View style={[StyleSheet.absoluteFillObject, { overflow: "hidden" }]} pointerEvents="none">
                  <VideoView player={videoPreviewPlayer} style={StyleSheet.absoluteFillObject} contentFit="cover" nativeControls={false} />
                </View>
              ) : (
                <Image source={{ uri: previewSlot.uri ?? "" }} style={styles.previewImage} contentFit="cover" />
              )}
              <View style={[styles.previewTopBtns, activeChallenge !== null && { top: 70 }]}>
                <TouchableOpacity style={styles.topSquareBtn} onPress={resetAll}><CloseIcon /></TouchableOpacity>
                {hasSlot2 && <TouchableOpacity style={styles.topSquareBtn} onPress={handleTrash}><TrashIcon /></TouchableOpacity>}
              </View>
              {viewingSlot === 1 && (
                <View style={[styles.previewContent, { bottom: 24 }]}>
                  {activeChallenge === null && (
                    <View style={{ gap: 12 }}>
                      <View style={styles.combinedInputContainer}>
                        <BlurView intensity={blur.md} tint="dark" style={StyleSheet.absoluteFillObject} />
                        {slot1!.captionAudioUri ? (
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <AudioCaptionPlayer 
                              player={captionAudioPlayer} 
                              status={captionAudioStatus} 
                              showVocalLabel 
                              onRemove={() => setSlot1(prev => prev ? { ...prev, captionAudioUri: null } : prev)} 
                              waveform={slot1!.captionWaveform}
                            />
                          </View>
                        ) : (
                          <>
                            {isCaptionRecording ? (
                              <View style={styles.recordingContainer}>
                                <TouchableOpacity
                                  style={{ paddingRight: 12 }}
                                  onPress={cancelCaptionAudioRecordingRef.current}
                                  activeOpacity={0.7}
                                >
                                  <View style={styles.captionIconContainer}>
                                    <BlurView intensity={blur.md} tint="dark" style={StyleSheet.absoluteFillObject} />
                                    <Animated.View style={{ transform: [{ scale: cancelScaleAnim }] }}>
                                      <Icon name="x" size={20} color={isSwipingToCancel ? colors.iconDangerTertiary : colors.white} />
                                    </Animated.View>
                                  </View>
                                </TouchableOpacity>
                                <View style={styles.captionRecordingOverlay}>
                                  <View style={[styles.audioWaveformRow, { flex: 1 }]} pointerEvents="none">
                                    {liveWaveform.map((v, i) => (
                                      <View key={i} style={[styles.audioWaveformBar, { height: Math.max(3.5, v * 40), backgroundColor: colors.white }]} />
                                    ))}
                                  </View>
                                  <Text style={styles.captionRecordingText}>{captionAudioSeconds}s</Text>
                                </View>
                              </View>
                            ) : (
                              <TouchableOpacity style={styles.previewNoteBox} onPress={() => setIsEditingNote(true)} activeOpacity={0.7}>
                                {slot1!.note ? (
                                  <Text style={styles.previewNoteText} numberOfLines={1}>{slot1!.note}</Text>
                                ) : (
                                  <Text style={styles.addNoteBtnText}>Ajouter une légende...</Text>
                                )}
                              </TouchableOpacity>
                            )}

                            <View
                              style={[isCaptionRecording ? styles.captionStopBtn : styles.captionRecordBtn, isSwipingToCancel && { opacity: 0.5 }]}
                              {...captionPanResponder.panHandlers}
                            >
                              <View style={styles.captionIconContainer}>
                                <BlurView intensity={blur.md} tint="dark" style={StyleSheet.absoluteFillObject} />
                                {isCaptionRecording ? (
                                  <Icon name="check" size={20} color={colors.text} />
                                ) : (
                                  <Icon name="mic" size={20} color={colors.text} />
                                )}
                              </View>
                            </View>
                          </>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
          {showBottomSlotBar && <SlotBar isSlot1Preview={isSlot1Preview} isSlot1WithSlot2={isSlot1WithSlot2} isSlot2Preview={isSlot2Preview} slot1={slot1} slot2={slot2} renderSlotThumbnail={renderSlotThumbnail} onAddSecond={() => { setTextModeContent(""); setIsDrawingActive(false); setCapturingSecond(true); capturingSecondRef.current = true; }} onSend={openGroupPicker} onViewSlot1={() => setViewingSlot(1)} onViewSlot2={() => setViewingSlot(2)} />}
          <Modal visible={isEditingNote} transparent animationType="fade">
            <BlurView intensity={100} tint="dark" style={styles.fill}>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.noteEditorContainer}>
                <TextInput style={styles.largeNoteInput} placeholder="Note..." placeholderTextColor="rgba(255,255,255,0.3)" value={slot1?.note ?? ""} onChangeText={updateSlot1Note} maxLength={140} multiline autofocus="off" />
                <TouchableOpacity style={styles.doneNoteBtn} onPress={() => setIsEditingNote(false)}>
                  <Text style={styles.doneNoteText}>Terminé</Text>
                </TouchableOpacity>
              </KeyboardAvoidingView>
            </BlurView>
          </Modal>
        </View>
      )}

      {/* ── Preview: Audio ── */}
      {!isCapturing && isActive && previewSlot?.mode === "AUDIO" && (
        <View style={[styles.previewContainer, { paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: NAVBAR_HEIGHT + 8, paddingHorizontal: 12 }]}>
          <View style={[styles.previewImageWrapper, { justifyContent: "center", alignItems: "center" }]}>
            {activeChallenge !== null && (
              <View style={challengeStyles.previewBannerOverlay} pointerEvents="box-none">
                <View style={challengeStyles.bannerRow}>
                  <TouchableOpacity style={challengeStyles.bannerClose} onPress={() => setActiveChallenge(null)} activeOpacity={0.7}>
                    <Svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <Path d="M18 6L6 18M6 6l12 12" stroke={colors.text} strokeWidth="2.5" strokeLinecap="round" />
                    </Svg>
                  </TouchableOpacity>
                  <View style={challengeStyles.bannerTextWrapper}>
                    <Text style={challengeStyles.bannerText} numberOfLines={2}>{activeChallenge.promptText}</Text>
                    {activeChallenge.proposedByUsername && (
                      <Text style={challengeStyles.bannerProposerText}>↳ {activeChallenge.proposedByUsername}</Text>
                    )}
                  </View>
                </View>
              </View>
            )}
            <View style={[styles.fill, { backgroundColor: "#0A0A0A" }]} />
            <View style={[styles.previewTopBtns, activeChallenge !== null && { top: 70 }]}>
              <TouchableOpacity style={styles.topSquareBtn} onPress={resetAll}><CloseIcon /></TouchableOpacity>
              {hasSlot2 && <TouchableOpacity style={styles.topSquareBtn} onPress={handleTrash}><TrashIcon /></TouchableOpacity>}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3.5, marginHorizontal: 20 }} pointerEvents="none">
              {(previewSlot?.waveform && previewSlot.waveform.length > 0 ? compressWaveform(previewSlot.waveform, 40).map(v => v * 80) : [10,14,22,30,38,34,26,20,14,18,28,36,44,40,32,24,16,12,20,30]).map((h, i, arr) => (
                <View key={i} style={{ width: 3.5, height: h, borderRadius: radii.xs, backgroundColor: colors.text, opacity: audioPreviewStatus.currentTime > 0 && audioPreviewStatus.duration > 0 && (audioPreviewStatus.currentTime / audioPreviewStatus.duration) > i / arr.length ? 0.9 : 0.25 }} />
              ))}
            </View>
            <View style={styles.audioPreviewPlayer}>
              <TouchableOpacity
                style={styles.audioPreviewPlayBtn}
                onPress={() => {
                  if (audioPreviewStatus.playing) { audioPreviewPlayer.pause(); }
                  else {
                    if (audioPreviewDurationRef.current > 0 && (audioPreviewStatus.currentTime ?? 0) >= audioPreviewDurationRef.current - 0.1) { audioPreviewPlayer.seekTo(0); }
                    audioPreviewPlayer.play();
                  }
                }}
              >
                <Svg width="28" height="28" viewBox="0 0 24 24" fill={colors.text}>
                  {audioPreviewStatus.playing ? <Path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /> : <Path d="M8 5v14l11-7z" />}
                </Svg>
              </TouchableOpacity>
              <View style={{ flex: 1, gap: 4 }}>
                <View
                  ref={audioPreviewSeekRef}
                  style={styles.audioPreviewSeekHitArea}
                  onLayout={() => { audioPreviewSeekRef.current?.measure((_x: number, _y: number, width: number, _h: number, pageX: number) => { audioPreviewSeekLayoutRef.current = { pageX, width }; }); }}
                  {...audioPreviewPan.panHandlers}
                >
                  <View style={styles.audioPreviewTrack}>
                    <View style={[styles.audioPreviewFill, { width: `${audioPreviewStatus.duration > 0 ? (audioPreviewStatus.currentTime / audioPreviewStatus.duration) * 100 : 0}%` as any }]} />
                  </View>
                  {audioPreviewStatus.currentTime > 0 && (
                    <View style={[styles.audioPreviewThumb, { left: `${Math.min(audioPreviewStatus.duration > 0 ? (audioPreviewStatus.currentTime / audioPreviewStatus.duration) * 100 : 0, 100)}%` as any }]} pointerEvents="none" />
                  )}
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={styles.audioPreviewTime}>{Math.floor((audioPreviewStatus.currentTime ?? 0) / 60)}:{(Math.floor(audioPreviewStatus.currentTime ?? 0) % 60).toString().padStart(2, "0")}</Text>
                  <Text style={styles.audioPreviewTime}>{Math.floor((audioPreviewStatus.duration ?? 0) / 60)}:{(Math.floor(audioPreviewStatus.duration ?? 0) % 60).toString().padStart(2, "0")}</Text>
                </View>
              </View>
            </View>
            {viewingSlot === 1 && (
              <View style={[styles.previewContent, { bottom: 24 }]}>
                <View style={styles.combinedInputContainer}>
                  <BlurView intensity={blur.md} tint="dark" style={StyleSheet.absoluteFillObject} />
                  <TouchableOpacity style={styles.previewNoteBox} onPress={() => setIsEditingNote(true)} activeOpacity={0.7}>
                    {slot1!.note ? (
                      <Text style={styles.previewNoteText} numberOfLines={1}>{slot1!.note}</Text>
                    ) : (
                      <Text style={styles.addNoteBtnText}>Ajouter une légende...</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
          {showBottomSlotBar && <SlotBar isSlot1Preview={isSlot1Preview} isSlot1WithSlot2={isSlot1WithSlot2} isSlot2Preview={isSlot2Preview} slot1={slot1} slot2={slot2} renderSlotThumbnail={renderSlotThumbnail} onAddSecond={() => { setTextModeContent(""); setIsDrawingActive(false); setCapturingSecond(true); capturingSecondRef.current = true; }} onSend={openGroupPicker} onViewSlot1={() => setViewingSlot(1)} onViewSlot2={() => setViewingSlot(2)} />}
          <Modal visible={isEditingNote} transparent animationType="fade">
            <BlurView intensity={100} tint="dark" style={styles.fill}>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.noteEditorContainer}>
                <TextInput style={styles.largeNoteInput} placeholder="Note..." placeholderTextColor="rgba(255,255,255,0.3)" value={slot1?.note ?? ""} onChangeText={updateSlot1Note} maxLength={140} multiline autofocus="off" />
                <TouchableOpacity style={styles.doneNoteBtn} onPress={() => setIsEditingNote(false)}>
                  <Text style={styles.doneNoteText}>Terminé</Text>
                </TouchableOpacity>
              </KeyboardAvoidingView>
            </BlurView>
          </Modal>
        </View>
      )}

      {/* ── Challenges Modal ── */}
      <ChallengesModal
        visible={showChallengesModal}
        onClose={() => setShowChallengesModal(false)}
        allGroups={allGroups}
        currentUserId={userId}
        onSelectChallenge={handleSelectChallenge}
      />

      {/* ── Confirmation effacer le dessin ── */}
      <Modal visible={showClearConfirm} transparent animationType="fade" onRequestClose={() => setShowClearConfirm(false)}>
        <Pressable style={pickerStyles.overlay} onPress={() => setShowClearConfirm(false)}>
          <Pressable style={pickerStyles.card} onPress={() => {}}>
            <Text style={pickerStyles.title}>Effacer le dessin ?</Text>
            <TouchableOpacity
              style={pickerStyles.sendBtn}
              onPress={() => { drawingRef.current?.clear(); setShowClearConfirm(false); }}
            >
              <Text style={pickerStyles.sendBtnText}>Tout effacer</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowClearConfirm(false)} style={pickerStyles.cancelWrap}>
              <Text style={pickerStyles.cancelText}>Annuler</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Group Picker ── */}
      <Modal visible={showGroupPicker} transparent animationType="fade" onRequestClose={() => setShowGroupPicker(false)}>
        <Pressable style={pickerStyles.overlay} onPress={() => setShowGroupPicker(false)}>
          <Pressable style={pickerStyles.card} onPress={() => {}}>
            <Text style={pickerStyles.title}>Envoyer dans...</Text>
            {allGroups.map((g) => {
              const selected = selectedGroupIds.includes(g.id);
              return (
                <TouchableOpacity key={g.id} style={pickerStyles.row} onPress={() => toggleGroup(g.id)} activeOpacity={0.7}>
                  <View style={[pickerStyles.checkbox, selected && pickerStyles.checkboxOn]}>
                    {selected && (
                      <Svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                        <Path d="M20 6L9 17L4 12" stroke={colors.bg} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    )}
                  </View>
                  <Text style={pickerStyles.groupName}>{g.name}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={[pickerStyles.sendBtn, selectedGroupIds.length === 0 && { opacity: 0.35 }]} onPress={handleConfirmGroupPicker} disabled={selectedGroupIds.length === 0}>
              <Text style={pickerStyles.sendBtnText}>Envoyer</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowGroupPicker(false)} style={pickerStyles.cancelWrap}>
              <Text style={pickerStyles.cancelText}>Annuler</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// Ordre cyclique des modes ; le mode sélectionné est toujours au centre, les
// deux autres glissent autour (carrousel circulaire).
const MODE_ORDER: { mode: CameraMode; label: string }[] = [
  { mode: "VIDEO", label: "Vidéo" },
  { mode: "PHOTO", label: "Photo" },
  { mode: "DESSIN", label: "Dessin" },
];
const MODE_ITEM_HEIGHT = 30;
const mod = (n: number, m: number) => ((n % m) + m) % m;

/**
 * Sélecteur de mode "carrousel" : le fond sélectionné reste fixe au centre,
 * et les modes roulent vers la gauche/droite pour que le mode choisi vienne
 * au centre (direction selon qu'il était à gauche ou à droite).
 */
function ModeSelector({ selected, onSelect }: { selected: CameraMode; onSelect: (m: CameraMode) => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  // Largeur concrète (80% écran, plafonnée) : indispensable car les items sont en
  // position absolue et ne donnent aucune largeur intrinsèque.
  const { width: winWidth } = useWindowDimensions();
  const pillWidth = Math.min(winWidth * 0.8, MODE_SELECTOR_MAX_WIDTH);
  const slotWidth = (pillWidth - spacing.sm * 2) / 3;

  // `v` = indice virtuel (non borné). Le mode à l'indice v est MODE_ORDER[mod(v,3)].
  const initialV = Math.max(0, MODE_ORDER.findIndex((m) => m.mode === selected));
  const pos = useRef(new Animated.Value(initialV)).current;
  const [centerV, setCenterV] = useState(initialV);
  const centerVRef = useRef(initialV);
  centerVRef.current = centerV;
  const animating = useRef(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const slotWidthRef = useRef(slotWidth);
  slotWidthRef.current = slotWidth;

  // Fait rouler le carrousel d'un cran vers le mode sélectionné, puis se relance
  // (gère les taps rapides : on draine les changements en attente à chaque fin).
  const settleRef = useRef<() => void>(() => {});
  settleRef.current = () => {
    if (slotWidthRef.current <= 0 || animating.current) return;
    const cv = centerVRef.current;
    if (MODE_ORDER[mod(cv, 3)].mode === selectedRef.current) return; // déjà centré
    // Avec 3 modes, l'autre mode est toujours à ±1 (le plus court chemin).
    const delta = MODE_ORDER[mod(cv + 1, 3)].mode === selectedRef.current ? 1 : -1;
    const newV = cv + delta;
    animating.current = true;
    Animated.timing(pos, {
      toValue: newV,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      animating.current = false;
      if (finished) {
        centerVRef.current = newV;
        setCenterV(newV);
      }
      settleRef.current();
    });
  };

  useEffect(() => { settleRef.current(); }, [selected, slotWidth]);

  const items: number[] = [];
  for (let v = centerV - 2; v <= centerV + 2; v++) items.push(v);

  return (
    <View style={[styles.modeSlider, { width: pillWidth }]}>
      <BlurView intensity={glassBlurIntensity} tint="dark" blurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.opacityLight }]} pointerEvents="none" />
      <View style={{ width: "100%", height: MODE_ITEM_HEIGHT }}>
        <View style={[styles.modeChip, { left: slotWidth, width: slotWidth }]} pointerEvents="none" />
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: Animated.multiply(pos, -slotWidth) }] }]}>
          {items.map((v) => {
            const item = MODE_ORDER[mod(v, 3)];
            return (
              <TouchableOpacity
                key={v}
                activeOpacity={0.8}
                onPress={() => onSelect(item.mode)}
                style={[styles.modeItem, { left: slotWidth + v * slotWidth, width: slotWidth }]}
              >
                <Text style={styles.modeText}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </Animated.View>
      </View>
    </View>
  );
}

// Bouton de contrôle caméra : carré glass (blur + fill default-opacity) + icône.
function CameraControlButton({ icon, onPress }: { icon: IconName; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity style={styles.cameraCtrlBtn} onPress={onPress} activeOpacity={0.8}>
      <BlurView intensity={glassBlurIntensity} tint="dark" blurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.opacityLight }]} pointerEvents="none" />
      <Icon name={icon} size={20} />
    </TouchableOpacity>
  );
}

function TorchIcon({ active }: { active: boolean }) {
  const { colors } = useTheme();
  const color = active ? "#FFD60A" : colors.text;
  return (
    <Svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "#FFD60A" : "none"} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </Svg>
  );
}

function ZoomSlider({ zoom, onZoom, onDragStart, onDragEnd }: { zoom: number; onZoom: (z: number) => void; onDragStart?: () => void; onDragEnd?: () => void }) {
  const zoomSliderStyles = useThemedStyles(makeZoomSliderStyles);
  const BAR_W = 200;
  const THUMB = 18;
  const barPageX = useRef(0);
  const barRef = useRef<View>(null);

  // Update refs synchronously during render — safe because they're only read in event handlers
  const onZoomRef = useRef(onZoom);
  const onDragStartRef = useRef(onDragStart);
  const onDragEndRef = useRef(onDragEnd);
  onZoomRef.current = onZoom;
  onDragStartRef.current = onDragStart;
  onDragEndRef.current = onDragEnd;

  // Animated.Value drives the visual — zero setState during drag, no re-render loop
  const animZoom = useRef(new Animated.Value(zoom)).current;
  const localZoomRef = useRef(zoom);
  const isDraggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  // Sync visual from parent only when not dragging (pinch gesture, camera flip reset)
  useEffect(() => {
    if (!isDraggingRef.current) animZoom.setValue(zoom);
  }, [zoom]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        isDraggingRef.current = true;
        onDragStartRef.current?.();
        const z = Math.max(0, Math.min(1, (e.nativeEvent.pageX - barPageX.current) / BAR_W));
        localZoomRef.current = z;
        animZoom.setValue(z);
        onZoomRef.current(z);
      },
      onPanResponderMove: (e) => {
        const z = Math.max(0, Math.min(1, (e.nativeEvent.pageX - barPageX.current) / BAR_W));
        localZoomRef.current = z;
        animZoom.setValue(z); // immediate visual update — no setState
        if (rafRef.current === null) {
          rafRef.current = requestAnimationFrame(() => {
            onZoomRef.current(localZoomRef.current); // camera zoom throttled to 60fps
            rafRef.current = null;
          });
        }
      },
      onPanResponderRelease: () => {
        if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        onZoomRef.current(localZoomRef.current);
        isDraggingRef.current = false;
        onDragEndRef.current?.();
      },
      onPanResponderTerminate: () => {
        if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        isDraggingRef.current = false;
        onDragEndRef.current?.();
      },
    })
  ).current;

  const thumbLeft = animZoom.interpolate({ inputRange: [0, 1], outputRange: [0, BAR_W - THUMB] });
  const fillWidth = animZoom.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const label = zoom < 0.005 ? '1×' : `${(1 + zoom * 4).toFixed(1)}×`;

  return (
    <View style={zoomSliderStyles.wrapper}>
      <Text style={zoomSliderStyles.label}>{label}</Text>
      <View
        ref={barRef}
        style={{ width: BAR_W, height: THUMB, justifyContent: "center" }}
        onLayout={() => {
          barRef.current?.measure((_fx, _fy, _w, _h, px) => { barPageX.current = px; });
        }}
        {...pan.panHandlers}
      >
        <View style={zoomSliderStyles.track}>
          <Animated.View style={[zoomSliderStyles.fill, { width: fillWidth }]} />
        </View>
        <Animated.View style={[zoomSliderStyles.thumb, { left: thumbLeft }]} />
      </View>
    </View>
  );
}

const makeZoomSliderStyles = (colors: ThemeColors) => StyleSheet.create({
  wrapper: { alignItems: "center", gap: 2, paddingBottom: 4 },
  label: { color: colors.text, fontSize: typography.size.xs, fontFamily: typography.family.medium, opacity: 0.85, minWidth: 36, textAlign: "center" },
  track: { height: 3, backgroundColor: colors.accentMuted, borderRadius: radii.xs, marginHorizontal: 9, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.text, borderRadius: radii.xs },
  thumb: { position: "absolute", width: 18, height: 18, borderRadius: radii.full, backgroundColor: colors.text, shadowColor: "#000000", shadowOpacity: 0.25, shadowRadius: 3, elevation: 3 },
});

function VideoSlotThumbnail({ uri, borderRadius = 0 }: { uri: string; borderRadius?: number }) {
  const player = useVideoPlayer(uri, p => { p.pause(); });
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <VideoView player={player} style={{ flex: 1, borderRadius }} contentFit="cover" nativeControls={false} />
    </View>
  );
}

type SlotBarProps = {
  isSlot1Preview: boolean;
  isSlot1WithSlot2: boolean;
  isSlot2Preview: boolean;
  slot1: SlotData | null;
  slot2: SlotData | null;
  renderSlotThumbnail: (slot: SlotData) => React.ReactNode;
  onAddSecond: () => void;
  onSend: () => void;
  onViewSlot1: () => void;
  onViewSlot2: () => void;
};

function SlotBar({ isSlot1Preview, isSlot1WithSlot2, isSlot2Preview, slot1, slot2, renderSlotThumbnail, onAddSecond, onSend, onViewSlot1, onViewSlot2 }: SlotBarProps) {
  const { colors } = useTheme();
  const slotBarStyles = useThemedStyles(makeSlotBarStyles);
  return (
    <View style={slotBarStyles.bar}>
      {isSlot1Preview && (
        <>
          <TouchableOpacity style={slotBarStyles.addBtn} onPress={onAddSecond}>
            <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <Path d="M12 5V19" stroke={colors.bg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <Path d="M5 12H19" stroke={colors.bg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
            <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <Path d="M20 9H11C9.89543 9 9 9.89543 9 11V20C9 21.1046 9.89543 22 11 22H20C21.1046 22 20 21.1046 22 20V11C22 9.89543 21.1046 9 20 9Z" stroke={colors.bg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <Path d="M5 15H4C3.46957 15 2.96086 14.7893 2.58579 14.4142C2.21071 14.0391 2 13.5304 2 13V4C2 3.46957 2.21071 2.96086 2.58579 2.58579C2.96086 2.21071 3.46957 2 4 2H13C13.5304 2 14.0391 2.21071 14.4142 2.58579C14.7893 2.96086 15 3.46957 15 4V5" stroke={colors.bg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
          </TouchableOpacity>
          <TouchableOpacity style={slotBarStyles.sendBtn} onPress={onSend}>
            <SendIcon color={colors.bg} />
            <Text style={slotBarStyles.sendText}>Envoyer</Text>
          </TouchableOpacity>
        </>
      )}
      {isSlot1WithSlot2 && (
        <>
          <TouchableOpacity style={slotBarStyles.thumbBtn} onPress={onViewSlot2}>
            {renderSlotThumbnail(slot2!)}
            <View style={slotBarStyles.badge}><Text style={slotBarStyles.badgeText}>2</Text></View>
          </TouchableOpacity>
          <TouchableOpacity style={slotBarStyles.sendBtn} onPress={onSend}>
            <SendIcon color={colors.bg} />
            <Text style={slotBarStyles.sendText}>Envoyer</Text>
          </TouchableOpacity>
        </>
      )}
      {isSlot2Preview && (
        <>
          <TouchableOpacity style={slotBarStyles.thumbBtn} onPress={onViewSlot1}>
            {renderSlotThumbnail(slot1!)}
            <View style={[slotBarStyles.badge, { right: 8 }]}><Text style={slotBarStyles.badgeText}>1</Text></View>
            <View style={slotBarStyles.swapOverlay}>
              <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <Path d="M7 16V4m0 0L3 8m4-4l4 4" /><Path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
              </Svg>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={slotBarStyles.sendBtn} onPress={onSend}>
            <SendIcon color={colors.bg} />
            <Text style={slotBarStyles.sendText}>Envoyer</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const makeSlotBarStyles = (colors: ThemeColors) => StyleSheet.create({
  bar: { height: 72, flexDirection: "row", gap: 12, marginTop: 8 },
  addBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.text, borderRadius: radii.lg },
  sendBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.text, borderRadius: radii.lg },
  sendText: { color: colors.bg, fontFamily: typography.family.bold, fontSize: typography.size.md },
  thumbBtn: { flex: 1, borderRadius: radii.lg, overflow: "hidden" },
  badge: { position: "absolute", top: 8, right: 8, width: 18, height: 18, borderRadius: radii.full, backgroundColor: colors.text, justifyContent: "center", alignItems: "center" },
  badgeText: { color: colors.bg, fontFamily: typography.family.bold, fontSize: typography.size.xs },
  swapOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.opacityLight, justifyContent: "center", alignItems: "center" },
});

function TrashIcon() {
  const { colors } = useTheme();
  return (
    <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 6h18" /><Path d="M19 6l-1 14H6L5 6" /><Path d="M8 6V4h8v2" />
    </Svg>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
  cameraPageContainer: { flex: 1, backgroundColor: colors.bg, alignItems: "center" },
  cameraInner: { width: "100%", aspectRatio: 9 / 16 },
  flashBtn: { position: "absolute", top: 16, right: 16, width: 48, height: 48, borderRadius: radii.xl, backgroundColor: colors.opacityLight, justifyContent: "center", alignItems: "center" },
  // Colonne de contrôles caméra, 16px du haut et de la droite du cadre.
  cameraControls: { position: "absolute", top: spacing.lg, right: spacing.lg, gap: spacing.sm },
  cameraCtrlBtn: { width: 40, height: 40, borderRadius: radii.md, overflow: "hidden", justifyContent: "center", alignItems: "center" },
  textModeContainer: { flex: 1, justifyContent: "flex-start", backgroundColor: colors.bg, paddingHorizontal: 32 },
  textModeInput: { color: colors.text, fontFamily: typography.family.bold, textAlign: "center", width: "100%", paddingTop: 0 },
  audioModeContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: 20, backgroundColor: colors.bg },
  audioProgressBar: { position: "absolute", left: 16, right: 16, height: 3, borderRadius: radii.xs, backgroundColor: colors.accentMuted, overflow: "hidden" },
  audioProgressFill: { height: "100%", borderRadius: radii.xs, backgroundColor: "#A78BFA" },
  audioRecordingIndicator: { flexDirection: "row", alignItems: "center", gap: 12 },
  audioRedDot: { width: 10, height: 10, borderRadius: radii.full, backgroundColor: "#FF3B30" },
  audioTimerText: { color: colors.text, fontFamily: typography.family.bold, fontSize: typography.size.subtitle, letterSpacing: 2, width: 260, textAlign: "center" },
  audioHintText: { color: colors.textTertiary, fontFamily: typography.family.regular, fontSize: typography.size.xs, letterSpacing: 0.5, marginTop: 4 },
  audioWaveformRow: { flexDirection: "row", alignItems: "center", gap: 4, height: 52 },
  audioWaveformBar: { width: 3.5, height: 44, borderRadius: radii.xs, backgroundColor: colors.text },
  cameraFooter: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: spacing.lg },
  modeSlider: { overflow: "hidden", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.md },
  modeChip: { position: "absolute", top: 0, bottom: 0, backgroundColor: colors.bg, borderRadius: radii.sm },
  modeItem: { position: "absolute", top: 0, bottom: 0, justifyContent: "center", alignItems: "center" },
  // single-line/body-small : Regular / 14 / lineHeight 100%
  modeText: { color: colors.text, ...textStyles.singleLineBodySmall },
  // Zone de dessin : même format que le retour caméra (9/16, coins haut arrondis).
  drawingArea: { width: "100%", aspectRatio: 9 / 16, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, overflow: "hidden", backgroundColor: "#FFFFFF" },
  drawingCloseBtn: { position: "absolute", top: spacing.lg, left: spacing.lg, width: 40, height: 40, borderRadius: radii.md, overflow: "hidden", backgroundColor: colors.opacityLight, justifyContent: "center", alignItems: "center" },
  // Pastille de couleur dans le bouton couleur (8px de padding dans le 40).
  colorDot: { width: 24, height: 24, borderRadius: radii.full },
  // Palette : s'ouvre à gauche du bouton (8px d'écart), même fond/radius que le bouton.
  colorPalette: { position: "absolute", top: 0, right: 40 + spacing.sm, overflow: "hidden", borderRadius: radii.md, padding: spacing.sm, gap: spacing.sm },
  colorPaletteRow: { flexDirection: "row", gap: spacing.xs },
  colorSwatch: { width: 24, height: 24, borderRadius: radii.full },
  colorSwatchSelected: { borderWidth: stroke.sm, borderColor: colors.cardBorder },
  audioIdleTouchable: { flex: 1, justifyContent: "center", alignItems: "center", gap: 20 },
  captureRow: { flexDirection: "row", alignItems: "center", gap: 32 },
  sideControlPlaceholder: { width: 48 },
  flipBtn: { width: 48, height: 48, borderRadius: radii.xl, backgroundColor: colors.accentMuted, justifyContent: "center", alignItems: "center" },
  captureBtn: { width: 80, height: 80, borderRadius: radii.full, overflow: "hidden", justifyContent: "center", alignItems: "center" },
  recordingTimer: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", backgroundColor: colors.opacityLight, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radii.lg, gap: 8 },
  recordingDot: { width: 10, height: 10, borderRadius: radii.full, backgroundColor: "#FF3B30" },
  recordingText: { color: colors.text, fontFamily: typography.family.semibold, fontSize: typography.size.sm },
  processingText: { color: colors.secondary, fontFamily: typography.family.semibold, fontSize: typography.size.sm },
  // Preview
  previewContainer: { flex: 1, backgroundColor: colors.bg, alignItems: "center" },
  previewImageWrapper: { flex: 1, width: "100%", borderRadius: radii.xl, overflow: "hidden", backgroundColor: colors.card },
  previewImage: { width: "100%", height: "100%" },
  drawingPreviewCenter: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-start", alignItems: "center" },
  drawingPreviewImage: { width: "100%", aspectRatio: 3 / 4, borderRadius: radii.xl, overflow: "hidden", backgroundColor: "#FFFFFF" },
  previewTopBtns: { position: "absolute", top: 16, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" },
  topSquareBtn: { width: 38, height: 38, borderRadius: radii.sm, backgroundColor: colors.opacityLight, justifyContent: "center", alignItems: "center" },
  previewContent: { position: "absolute", left: 24, right: 24 },
  previewNoteBox: { backgroundColor: colors.opacityLight, padding: 16, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.cardBorder },
  previewNoteText: { color: colors.text, fontSize: typography.size.md, fontFamily: typography.family.semibold, textAlign: "center" },
  addNoteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 16, borderRadius: radii.lg, backgroundColor: colors.opacityLight, borderStyle: "dashed", borderWidth: 1, borderColor: colors.borderSecondary },
  addNoteBtnText: { color: colors.secondary, fontSize: typography.size.sm, fontFamily: typography.family.semibold },
  noteEditorContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  largeNoteInput: { width: "100%", color: colors.text, fontSize: typography.size.xxl, fontFamily: typography.family.bold, textAlign: "center", marginBottom: 40 },
  doneNoteBtn: { backgroundColor: colors.text, paddingHorizontal: 32, paddingVertical: 14, borderRadius: radii.xl },
  doneNoteText: { color: colors.bg, fontFamily: typography.family.bold, fontSize: typography.size.md },
  // Audio preview
  audioPreviewPlayer: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 32, paddingHorizontal: 24, width: "100%" },
  audioPreviewPlayBtn: { width: 52, height: 52, borderRadius: radii.full, backgroundColor: colors.accentMuted, justifyContent: "center", alignItems: "center" },
  audioPreviewSeekHitArea: { paddingVertical: 14, justifyContent: "center" },
  audioPreviewTrack: { height: 3, backgroundColor: colors.accentMuted, borderRadius: radii.xs },
  audioPreviewFill: { height: 3, backgroundColor: colors.text, borderRadius: radii.xs },
  audioPreviewThumb: { position: "absolute", width: 13, height: 13, borderRadius: radii.sm, backgroundColor: colors.text, marginLeft: -6, top: 14 - 5 },
  audioPreviewTime: { fontSize: typography.size.xs, color: colors.textSecondary, fontFamily: typography.family.regular },
  // Barre full-width de switch/envoi pendant la 2e capture
  capturingSecondBar: { position: "absolute", left: 12, right: 12, height: 72, flexDirection: "row", gap: 12 },
  capturingSecondThumb: { flex: 1, borderRadius: radii.lg, overflow: "hidden" },
  // Caption Audio
  combinedInputContainer: { flexDirection: "row", alignItems: "center", borderRadius: radii.lg, overflow: "hidden", minHeight: 48, paddingHorizontal: spacing.sm, gap: spacing.sm },
  recordingContainer: { flexDirection: "row", alignItems: "center", flex: 1, gap: spacing.sm },
  captionRecordBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  captionRecordBtnActive: { backgroundColor: "#FF3B30" },
  captionStopBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  captionIconContainer: {
    width: 32,
    height: 32,
    borderRadius: radii.sm, // sds-size-radius-200 mapped to radii.sm
    backgroundColor: colors.opacityLight, // background-default-default-opacity
    justifyContent: "center",
    alignItems: "center",
    // blur/glass effect (approximated for RN)
    overflow: "hidden",
  },
  captionRecordingOverlay: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  captionRecordingText: { color: colors.white, fontFamily: typography.family.bold, fontSize: typography.size.xs, minWidth: 24 },
});

const makeChallengeStyles = (colors: ThemeColors) => StyleSheet.create({
  topContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  challengeBtn: {
    backgroundColor: colors.brand,
    padding: spacing.md,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  challengeBtnText: {
    color: colors.textBrandOnBrandSecondary,
    ...textStyles.singleLineBodyBaseStrong,
  },
  bannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    backgroundColor: colors.bg,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  previewBannerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  bannerClose: {
    width: 30,
    height: 30,
    borderRadius: radii.lg,
    backgroundColor: colors.accentMuted,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  bannerTextWrapper: {
    flex: 1,
  },
  bannerText: {
    color: colors.text,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
    lineHeight: 18,
  },
  bannerProposerText: {
    color: "rgba(255,200,80,0.75)",
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
    marginTop: 2,
  },
});

const makePickerStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.opacityLight, justifyContent: "center", alignItems: "center", padding: 28 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 24, width: "100%" },
  title: { fontSize: typography.size.lg, fontFamily: typography.family.bold, color: colors.text, marginBottom: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.cardBorder },
  checkbox: { width: 22, height: 22, borderRadius: radii.xs, borderWidth: 2, borderColor: colors.borderSecondary, justifyContent: "center", alignItems: "center" },
  checkboxOn: { backgroundColor: colors.text, borderColor: colors.text },
  groupName: { color: colors.text, fontFamily: typography.family.semibold, fontSize: typography.size.md, flex: 1 },
  sendBtn: { backgroundColor: colors.text, borderRadius: radii.md, paddingVertical: 14, alignItems: "center", marginTop: 20, marginBottom: 8 },
  sendBtnText: { color: colors.bg, fontSize: typography.size.md, fontFamily: typography.family.bold },
  cancelWrap: { alignItems: "center", paddingVertical: 8 },
  cancelText: { color: colors.textTertiary, fontFamily: typography.family.semibold, fontSize: typography.size.sm },
});

export default function CameraPage(props: Props) {
  return (
    <CameraErrorBoundary>
      <CameraPageInner {...props} />
    </CameraErrorBoundary>
  );
}
