import React, { useState, useRef, useEffect, Component } from "react";
import {
  View, Text, StyleSheet, Animated, Easing, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform, TextInput, Modal, Pressable, PanResponder, ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { BlurView } from "expo-blur";
import { type CameraType, type FlashMode, useCameraPermissions } from "expo-camera";
import { manipulateAsync, FlipType, SaveFormat } from "expo-image-manipulator";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { useAudioRecorder, AudioModule, RecordingPresets, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { SeamlessRecorder, type SeamlessRecorderRef } from "seamless-recorder";
import { setCaptureData } from "../../lib/capture-store";
import { useUpload } from "../../lib/upload-context";
import DrawingCanvas, { type DrawingCanvasRef } from "../DrawingCanvas";
import { SendIcon, FeatherIcon, FlipIcon, CloseIcon, FlashIcon } from "./GroupIcons";
import { VolumeManager } from "react-native-volume-manager";
import ChallengesModal from "./ChallengesModal";
import { type ActiveChallenge } from "../../lib/challenges";
import { colors, radii, typography } from "../../lib/theme";
import { AudioCaptionPlayer } from "../molecules/AudioCaptionPlayer";

const NAVBAR_HEIGHT = 100;

type CameraMode = "PHOTO" | "VIDEO" | "AUDIO" | "DESSIN" | "TEXTE";

type SlotData = {
  mode: CameraMode;
  uri: string | null;
  audioUri: string | null;
  textContent: string;
  note: string;
  captionAudioUri?: string | null;
};

type GroupInfo = { id: string; name: string };

type Props = {
  groupId: string;
  userId: string;
  isActive: boolean;
  allGroups: GroupInfo[];
  onScrollLock: (locked: boolean) => void;
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

function CameraPageInner({ groupId, userId, isActive, allGroups, onScrollLock, onCaptureSent }: Props) {
  const insets = useSafeAreaInsets();
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
  const [drawingColor, setDrawingColor] = useState(colors.black);
  const [drawingStrokeWidth, setDrawingStrokeWidth] = useState(6);
  const [isDrawingActive, setIsDrawingActive] = useState(false);
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

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  
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
        const relX = evt.nativeEvent.pageX - audioPreviewSeekLayoutRef.current.pageX;
        const ratio = Math.max(0, Math.min(1, relX / audioPreviewSeekLayoutRef.current.width));
        audioPreviewPlayerRef.current.seekTo(ratio * audioPreviewDurationRef.current);
      },
      onPanResponderMove: (evt) => {
        const relX = evt.nativeEvent.pageX - audioPreviewSeekLayoutRef.current.pageX;
        const ratio = Math.max(0, Math.min(1, relX / audioPreviewSeekLayoutRef.current.width));
        audioPreviewPlayerRef.current.seekTo(ratio * audioPreviewDurationRef.current);
      },
    })
  ).current;

  useEffect(() => {
    const locked = slot1 !== null || isPinching || isDrawingActive || isZoomDragging || isRecording;
    onScrollLock(locked);
  }, [slot1, isPinching, isDrawingActive, isZoomDragging, isRecording]);

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
      await audioRecorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
      
      // Delay to ensure native activity/audio state is ready on Android
      if (Platform.OS === "android") await new Promise(resolve => setTimeout(resolve, 150));
      
      // Check if we were stopped in the meantime
      if (!isAudioRecordingRef.current) {
        await audioRecorder.stop().catch(() => {});
        return;
      }

      await audioRecorder.record();
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
      saveToSlot({ mode: "AUDIO", uri: null, audioUri: audioRecorder.uri, textContent: "", note: "" });
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
      setSlot1(prev => prev ? { ...prev, captionAudioUri: audioRecorder.uri } : prev);
    }
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
      if (!isDrawingActive) { setIsDrawingActive(true); return; }
      if (!drawingRef.current) return;
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
          secondFile,
          activeChallenge.isTarget
        );
      } else {
        startUpload(fileName, fileUri, contentType, dbData, secondFile, captionAudioFile);
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
          <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <Path d="M19 10v2a7 7 0 0 1-14 0v-2" /><Path d="M12 19v4" /><Path d="M8 23h8" />
          </Svg>
        </View>
      );
    }
    // TEXTE
    return (
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#1A1A1A", justifyContent: "center", alignItems: "center", padding: 6 }]}>
        <Text style={{ color: colors.white, fontSize: typography.size.xs, fontFamily: typography.family.semibold }} numberOfLines={2}>{slot.textContent}</Text>
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
          <View style={[styles.cameraPageContainer, { paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: 24, paddingHorizontal: 12 }]}>
            <View style={styles.drawingArea}>
              {!isDrawingActive ? (
                <TouchableOpacity style={styles.drawingIdleOverlay} onPress={() => setIsDrawingActive(true)} activeOpacity={0.6}>
                  <Svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M12 20h9" /><Path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </Svg>
                  <Text style={styles.drawingHintText}>Appuie pour commencer à dessiner</Text>
                </TouchableOpacity>
              ) : (
                <DrawingCanvas ref={drawingRef} color={drawingColor} strokeWidth={drawingStrokeWidth} onHistoryChange={(u, r) => { setCanUndo(u); setCanRedo(r); }} />
              )}
            </View>
          </View>
        ) : cameraMode === "AUDIO" ? (
          <View style={styles.audioModeContainer}>
            {isAudioRecording ? (
              <>
                <View style={[styles.audioProgressBar, { top: insets.top + 8 }]}>
                  <Animated.View style={[styles.audioProgressFill, { width: audioProgressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
                </View>
                <View style={styles.audioRecordingIndicator}>
                  <View style={styles.audioRedDot} />
                  <Text style={styles.audioTimerText}>{audioSeconds}s / 30s</Text>
                </View>
                <View style={styles.audioWaveformRow} pointerEvents="none">
                  {audioWaveAnims.map(({ anim }, i) => (
                    <Animated.View key={i} style={[styles.audioWaveformBar, { transform: [{ scaleY: anim }] }]} />
                  ))}
                </View>
              </>
            ) : (
              <TouchableOpacity style={styles.audioIdleTouchable} onPress={startAudioRecording} activeOpacity={0.7}>
                <Svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <Path d="M19 10v2a7 7 0 0 1-14 0v-2" /><Path d="M12 19v4" /><Path d="M8 23h8" />
                </Svg>
                <Text style={styles.audioHintText}>Appuie pour enregistrer</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={[styles.cameraPageContainer, { paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: (capturingSecond && slot1) ? NAVBAR_HEIGHT + 92 : NAVBAR_HEIGHT + 12, paddingHorizontal: 12 }]}>
            <View style={styles.cameraInner}>
              <>
                {/* Camera view clipped to rounded rect — only mount when permission is granted */}
                <View style={[StyleSheet.absoluteFillObject, { borderRadius: radii.xl, overflow: "hidden" }]}>
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
              {/* Flash (photo) / Torch (video) button */}
              {activeChallenge === null && (cameraMode === "PHOTO" || cameraMode === "VIDEO") && !isRecording && (
                <TouchableOpacity
                  style={[styles.flashBtn, cameraMode === "VIDEO" && torch && { backgroundColor: "rgba(255,200,0,0.35)" }]}
                  onPress={() => {
                    if (cameraMode === "VIDEO") setTorch(t => !t);
                    else setFlash(prev => prev === "off" ? "on" : prev === "on" ? "auto" : "off");
                  }}
                >
                  {cameraMode === "VIDEO"
                    ? <TorchIcon active={torch} />
                    : <FlashIcon mode={flash} />
                  }
                </TouchableOpacity>
              )}
            </View>
          </View>
        )
      )}

      {/* ── Écran traitement vidéo supprimé (SeamlessRecorder = zéro post-processing) ── */}
      {false && (
        <View style={[styles.previewContainer, { paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: NAVBAR_HEIGHT + 8, paddingHorizontal: 12 }]}>
          <View style={[styles.previewImageWrapper, { backgroundColor: colors.black, justifyContent: "center", alignItems: "center", gap: 16 }]}>
            <ActivityIndicator size="large" color={colors.white} />
            <Text style={styles.processingText}>Traitement…</Text>
          </View>
          <View style={[slotBarStyles.bar, { opacity: 0.35 }]} pointerEvents="none">
            <View style={slotBarStyles.addBtn}>
              <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <Path d="M12 5V19" stroke={colors.black} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <Path d="M5 12H19" stroke={colors.black} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </Svg>
              <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <Path d="M20 9H11C9.89543 9 9 9.89543 9 11V20C9 21.1046 9.89543 22 11 22H20C21.1046 22 20 21.1046 22 20V11C22 9.89543 21.1046 9 20 9Z" stroke={colors.black} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <Path d="M5 15H4C3.46957 15 2.96086 14.7893 2.58579 14.4142C2.21071 14.0391 2 13.5304 2 13V4C2 3.46957 2.21071 2.96086 2.58579 2.58579C2.96086 2.21071 3.46957 2 4 2H13C13.5304 2 14.0391 2.21071 14.4142 2.58579C14.7893 2.96086 15 3.46957 15 4V5" stroke={colors.black} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </Svg>
            </View>
            <View style={slotBarStyles.sendBtn}>
              <SendIcon color={colors.black} />
              <Text style={slotBarStyles.sendText}>Envoyer</Text>
            </View>
          </View>
        </View>
      )}

      {/* ── Camera UI overlay ── */}
      {isCapturing && (
        <View style={styles.fill} pointerEvents="box-none">
          {/* Challenge top area (button or active banner) */}
          {!capturingSecond && !(cameraMode === "DESSIN" && isDrawingActive) && (
            activeChallenge === null ? (
              <View style={[challengeStyles.topContainer, { paddingTop: insets.top }]} pointerEvents="box-none">
                <View style={challengeStyles.btnWrapper}>
                  <TouchableOpacity
                    style={challengeStyles.challengeBtn}
                    onPress={() => setShowChallengesModal(true)}
                    activeOpacity={0.8}
                  >
                    <Svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={colors.black} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                      <Path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                      <Path d="M4 22h16" />
                      <Path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                      <Path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                      <Path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
                    </Svg>
                    <Text style={challengeStyles.challengeBtnText}>Défis</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={[challengeStyles.topContainer, { top: Math.max(insets.top, 12) + 12, left: 12, right: 12 }]} pointerEvents="box-none">
                <View style={challengeStyles.bannerRow} pointerEvents="box-none">
                  <TouchableOpacity
                    style={challengeStyles.bannerClose}
                    onPress={() => setActiveChallenge(null)}
                    activeOpacity={0.7}
                  >
                    <Svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <Path d="M18 6L6 18M6 6l12 12" stroke={colors.white} strokeWidth="2.5" strokeLinecap="round" />
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

          {cameraMode === "DESSIN" && isDrawingActive && (
            <TouchableOpacity
              pointerEvents="auto"
              style={[styles.drawingCancelBtn, { top: Math.max(insets.top, 12) + 28 }]}
              onPress={() => setIsDrawingActive(false)}
            >
              <CloseIcon />
            </TouchableOpacity>
          )}
          {isRecording && (
            <View style={[styles.recordingTimer, { top: Math.max(insets.top, 40) }]}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>{recordingSeconds}s / 15s</Text>
            </View>
          )}

          <View style={[styles.cameraFooter, { bottom: (cameraMode === "DESSIN" && isDrawingActive) ? insets.bottom + 16 : (capturingSecond && slot1 ? NAVBAR_HEIGHT + 104 : NAVBAR_HEIGHT + 24) }]}>
            {cameraMode === "DESSIN" && isDrawingActive ? (
              <View style={styles.drawingToolbar}>
                <TouchableOpacity style={[styles.drawingUndoBtn, !canUndo && styles.drawingUndoBtnDisabled]} onPress={() => drawingRef.current?.undo()} disabled={!canUndo}>
                  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={canUndo ? colors.white : "rgba(255,255,255,0.25)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M1 4v6h6" /><Path d="M3.51 15a9 9 0 1 0 .49-3.51L1 10" />
                  </Svg>
                </TouchableOpacity>
                <View style={styles.drawingColorGrid}>
                  {[
                    [colors.black,colors.white,"#FF3B30","#FF9F0A","#FFD60A"],
                    ["#30D158","#0A84FF","#BF5AF2","#FF2D92","#FF6B35"],
                    ["#5AC8FA","#34C759","#A2845E","#8E8E93","#1C1C1E"],
                  ].map((row, ri) => (
                    <View key={ri} style={styles.drawingColorRow}>
                      {row.map((c) => (
                        <TouchableOpacity key={c} onPress={() => setDrawingColor(c)} style={[styles.drawingColorDot, { backgroundColor: c }, drawingColor === c && styles.drawingColorDotActive]} />
                      ))}
                    </View>
                  ))}
                  <View style={styles.drawingBrushRow}>
                    {([3, 6, 12] as const).map((size) => (
                      <TouchableOpacity key={size} onPress={() => setDrawingStrokeWidth(size)} style={styles.drawingBrushBtn}>
                        <View style={[styles.drawingBrushDot, { width: size * 2.5, height: size * 2.5, borderRadius: size * 1.25, backgroundColor: drawingColor }, drawingStrokeWidth === size && styles.drawingBrushDotActive]} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <TouchableOpacity style={[styles.drawingUndoBtn, !canRedo && styles.drawingUndoBtnDisabled]} onPress={() => drawingRef.current?.redo()} disabled={!canRedo}>
                  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={canRedo ? colors.white : "rgba(255,255,255,0.25)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M23 4v6h-6" /><Path d="M20.49 15a9 9 0 1 1-.49-3.51L23 10" />
                  </Svg>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ alignItems: "center", gap: 6 }}>
                {(cameraMode === "PHOTO" || cameraMode === "VIDEO") && (
                  <ZoomSlider zoom={zoom} onZoom={(z) => { setZoom(z); savedZoomRef.current = z; }} onDragStart={() => { setIsZoomDragging(true); onScrollLockRef.current(true); }} onDragEnd={() => setIsZoomDragging(false)} />
                )}
                {(activeChallenge === null || capturingSecond) && !isRecording && !isAudioRecording && (
                  <View style={styles.modeSlider}>
                    {(["PHOTO", "VIDEO", "AUDIO", "DESSIN", "TEXTE"] as CameraMode[]).map((m) => (
                      <TouchableOpacity key={m} onPress={() => { setCameraMode(m); if (m !== "DESSIN") setIsDrawingActive(false); }}>
                        <Text style={[styles.modeText, cameraMode === m && styles.modeTextActive]}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            <View style={styles.captureRow}>
              {cameraMode !== "TEXTE" && <View style={styles.sideControlPlaceholder} />}
              {!(capturingSecond && cameraMode === "TEXTE") && <TouchableOpacity
                style={[styles.captureBtn, (cameraMode === "VIDEO" || isRecording) && styles.captureBtnVideo, isRecording && styles.captureBtnRecording, cameraMode === "AUDIO" && styles.captureBtnAudio, isAudioRecording && styles.captureBtnAudioRecording, (cameraMode === "TEXTE" && !!textModeContent.trim() || (cameraMode === "DESSIN" && isDrawingActive && canUndo)) && styles.captureBtnValid, (cameraMode === "TEXTE" && !textModeContent.trim() || (cameraMode === "DESSIN" && isDrawingActive && !canUndo)) && styles.captureBtnDimmed]}
                onPress={handleCapture}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                disabled={isPinching || (cameraMode === "TEXTE" && !textModeContent.trim()) || (cameraMode === "DESSIN" && isDrawingActive && !canUndo)}
                activeOpacity={0.8}
              >
                <View style={[styles.captureInner, (cameraMode === "VIDEO" || isRecording) && styles.captureInnerVideo, isRecording && styles.captureInnerRecording, cameraMode === "AUDIO" && styles.captureInnerAudio, isAudioRecording && styles.captureInnerAudioRecording, (cameraMode === "TEXTE" && !!textModeContent.trim() || (cameraMode === "DESSIN" && isDrawingActive && canUndo)) && styles.captureInnerValid, (cameraMode === "TEXTE" && !textModeContent.trim() || (cameraMode === "DESSIN" && isDrawingActive && !canUndo)) && styles.captureInnerDimmed]}>
                  {cameraMode === "TEXTE" && (
                    <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={textModeContent.trim() ? colors.white : "rgba(255,255,255,0.3)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M20 6L9 17l-5-5" />
                    </Svg>
                  )}
                  {cameraMode === "DESSIN" && !isDrawingActive && (
                    <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.black} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M12 20h9" /><Path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </Svg>
                  )}
                  {cameraMode === "DESSIN" && isDrawingActive && (
                    <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M20 6L9 17l-5-5" />
                    </Svg>
                  )}
                  {cameraMode === "AUDIO" && !isAudioRecording && (
                    <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.black} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <Path d="M19 10v2a7 7 0 0 1-14 0v-2" /><Path d="M12 19v4" /><Path d="M8 23h8" />
                    </Svg>
                  )}
                  {isAudioRecording && <View style={{ width: 22, height: 22, borderRadius: radii.xs, backgroundColor: colors.black }} />}
                </View>
              </TouchableOpacity>}
              {cameraMode !== "TEXTE" && cameraMode !== "AUDIO" && cameraMode !== "DESSIN" && (
                <TouchableOpacity style={styles.flipBtn} onPress={handleFlipCamera}>
                  <FlipIcon />
                </TouchableOpacity>
              )}
              {(cameraMode === "AUDIO" || cameraMode === "DESSIN") && <View style={styles.sideControlPlaceholder} />}
            </View>
          </View>
          {/* ── Barre switch/envoyer pendant la 2e capture ── */}
          {capturingSecond && slot1 && !(cameraMode === "DESSIN" && isDrawingActive) && (
            <View style={[styles.capturingSecondBar, { bottom: NAVBAR_HEIGHT + 8 }]}>
              <TouchableOpacity
                style={styles.capturingSecondThumb}
                onPress={() => { setCapturingSecond(false); capturingSecondRef.current = false; setViewingSlot(1); }}
                activeOpacity={0.8}
              >
                {renderSlotThumbnail(slot1)}
                <View style={[slotBarStyles.badge, { top: 6, right: 6 }]}><Text style={slotBarStyles.badgeText}>1</Text></View>
                <View style={slotBarStyles.swapOverlay}>
                  <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M7 16V4m0 0L3 8m4-4l4 4" /><Path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
                  </Svg>
                </View>
              </TouchableOpacity>
              {cameraMode === "TEXTE" && slot2 && (
                <TouchableOpacity style={slotBarStyles.sendBtn} onPress={openGroupPicker}>
                  <SendIcon color={colors.black} />
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
                        <Path d="M18 6L6 18M6 6l12 12" stroke={colors.white} strokeWidth="2.5" strokeLinecap="round" />
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
                <Text style={{ color: colors.white, fontFamily: typography.family.bold, textAlign: "center", fontSize: previewSlot.textContent.length <= 120 ? 32 : previewSlot.textContent.length <= 260 ? 26 : previewSlot.textContent.length <= 450 ? 21 : 17 }}>
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
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        {slot1!.captionAudioUri && (
                          <View style={[styles.captionAudioContainer, { alignSelf: "stretch", flex: 1 }]}>
                            <AudioCaptionPlayer 
                              player={captionAudioPlayer} 
                              status={captionAudioStatus} 
                              showVocalLabel 
                              onRemove={() => setSlot1(prev => prev ? { ...prev, captionAudioUri: null } : prev)} 
                            />
                          </View>
                        )}                        {slot1!.note ? (
                          <Pressable style={styles.previewNoteBox} onPress={() => setIsEditingNote(true)}>
                            <Text style={styles.previewNoteText}>{slot1!.note}</Text>
                          </Pressable>
                        ) : (
                          !slot1!.captionAudioUri && (
                            <TouchableOpacity style={styles.addNoteBtn} onPress={() => setIsEditingNote(true)}>
                              <FeatherIcon /><Text style={styles.addNoteBtnText}>Ajouter une légende...</Text>
                            </TouchableOpacity>
                          )
                        )}
                      </View>

                      {!slot1!.captionAudioUri && (
                        <TouchableOpacity
                          style={[styles.captionRecordBtn, isCaptionRecording && styles.captionRecordBtnActive]}
                          onPressIn={startCaptionAudioRecording}
                          onPressOut={stopCaptionAudioRecording}
                          activeOpacity={0.8}
                        >
                          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                            <Path d="M19 10v2a7 7 0 0 1-14 0v-2" /><Path d="M12 19v4" /><Path d="M8 23h8" />
                          </Svg>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {isCaptionRecording && (
                    <View style={styles.captionRecordingOverlay}>
                      <View style={styles.audioWaveformRow} pointerEvents="none">
                        {audioWaveAnims.map(({ anim }, i) => (
                          <Animated.View key={i} style={[styles.audioWaveformBar, { transform: [{ scaleY: anim }], backgroundColor: colors.white }]} />
                        ))}
                      </View>
                      <Text style={styles.captionRecordingText}>{captionAudioSeconds}s</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.previewImageWrapper, previewSlot.mode === "DESSIN" && { backgroundColor: colors.black }]}>
              {activeChallenge !== null && (
                <View style={challengeStyles.previewBannerOverlay} pointerEvents="box-none">
                  <View style={challengeStyles.bannerRow}>
                    <TouchableOpacity style={challengeStyles.bannerClose} onPress={() => setActiveChallenge(null)} activeOpacity={0.7}>
                      <Svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <Path d="M18 6L6 18M6 6l12 12" stroke={colors.white} strokeWidth="2.5" strokeLinecap="round" />
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
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        {slot1!.captionAudioUri && (
                          <View style={[styles.captionAudioContainer, { alignSelf: "stretch", flex: 1 }]}>
                            <AudioCaptionPlayer 
                              player={captionAudioPlayer} 
                              status={captionAudioStatus} 
                              showVocalLabel 
                              onRemove={() => setSlot1(prev => prev ? { ...prev, captionAudioUri: null } : prev)} 
                            />
                          </View>
                        )}                        {slot1!.note ? (
                          <Pressable style={styles.previewNoteBox} onPress={() => setIsEditingNote(true)}>
                            <Text style={styles.previewNoteText}>{slot1!.note}</Text>
                          </Pressable>
                        ) : (
                          !slot1!.captionAudioUri && (
                            <TouchableOpacity style={styles.addNoteBtn} onPress={() => setIsEditingNote(true)}>
                              <FeatherIcon /><Text style={styles.addNoteBtnText}>Ajouter une légende...</Text>
                            </TouchableOpacity>
                          )
                        )}
                      </View>

                      {!slot1!.captionAudioUri && (
                        <TouchableOpacity
                          style={[styles.captionRecordBtn, isCaptionRecording && styles.captionRecordBtnActive]}
                          onPressIn={startCaptionAudioRecording}
                          onPressOut={stopCaptionAudioRecording}
                          activeOpacity={0.8}
                        >
                          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                            <Path d="M19 10v2a7 7 0 0 1-14 0v-2" /><Path d="M12 19v4" /><Path d="M8 23h8" />
                          </Svg>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {isCaptionRecording && (
                    <View style={styles.captionRecordingOverlay}>
                      <View style={styles.audioWaveformRow} pointerEvents="none">
                        {audioWaveAnims.map(({ anim }, i) => (
                          <Animated.View key={i} style={[styles.audioWaveformBar, { transform: [{ scaleY: anim }], backgroundColor: colors.white }]} />
                        ))}
                      </View>
                      <Text style={styles.captionRecordingText}>{captionAudioSeconds}s</Text>
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
                      <Path d="M18 6L6 18M6 6l12 12" stroke={colors.white} strokeWidth="2.5" strokeLinecap="round" />
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }} pointerEvents="none">
              {[18,32,48,36,60,80,52,68,42,62,88,72,50,38,68,82,58,44,28,52].map((h, i) => (
                <View key={i} style={{ width: 3, height: h, borderRadius: radii.xs, backgroundColor: colors.white, opacity: audioPreviewStatus.currentTime > 0 && audioPreviewStatus.duration > 0 && (audioPreviewStatus.currentTime / audioPreviewStatus.duration) > i / 20 ? 0.9 : 0.25 }} />
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
                <Svg width="28" height="28" viewBox="0 0 24 24" fill={colors.white}>
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
                {slot1!.note ? (
                  <Pressable style={styles.previewNoteBox} onPress={() => setIsEditingNote(true)}>
                    <Text style={styles.previewNoteText}>{slot1!.note}</Text>
                  </Pressable>
                ) : (
                  <TouchableOpacity style={styles.addNoteBtn} onPress={() => setIsEditingNote(true)}>
                    <FeatherIcon /><Text style={styles.addNoteBtnText}>Ajouter une légende...</Text>
                  </TouchableOpacity>
                )}
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
                        <Path d="M20 6L9 17L4 12" stroke={colors.black} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
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

function TorchIcon({ active }: { active: boolean }) {
  const color = active ? "#FFD60A" : colors.white;
  return (
    <Svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "#FFD60A" : "none"} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </Svg>
  );
}

function ZoomSlider({ zoom, onZoom, onDragStart, onDragEnd }: { zoom: number; onZoom: (z: number) => void; onDragStart?: () => void; onDragEnd?: () => void }) {
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

const zoomSliderStyles = StyleSheet.create({
  wrapper: { alignItems: "center", gap: 2, paddingBottom: 4 },
  label: { color: colors.white, fontSize: typography.size.xs, fontFamily: typography.family.medium, opacity: 0.85, minWidth: 36, textAlign: "center" },
  track: { height: 3, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: radii.xs, marginHorizontal: 9, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: "rgba(255,255,255,0.85)", borderRadius: radii.xs },
  thumb: { position: "absolute", width: 18, height: 18, borderRadius: radii.full, backgroundColor: colors.white, shadowColor: colors.black, shadowOpacity: 0.25, shadowRadius: 3, elevation: 3 },
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
  return (
    <View style={slotBarStyles.bar}>
      {isSlot1Preview && (
        <>
          <TouchableOpacity style={slotBarStyles.addBtn} onPress={onAddSecond}>
            <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <Path d="M12 5V19" stroke={colors.black} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <Path d="M5 12H19" stroke={colors.black} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
            <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <Path d="M20 9H11C9.89543 9 9 9.89543 9 11V20C9 21.1046 9.89543 22 11 22H20C21.1046 22 20 21.1046 22 20V11C22 9.89543 21.1046 9 20 9Z" stroke={colors.black} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <Path d="M5 15H4C3.46957 15 2.96086 14.7893 2.58579 14.4142C2.21071 14.0391 2 13.5304 2 13V4C2 3.46957 2.21071 2.96086 2.58579 2.58579C2.96086 2.21071 3.46957 2 4 2H13C13.5304 2 14.0391 2.21071 14.4142 2.58579C14.7893 2.96086 15 3.46957 15 4V5" stroke={colors.black} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </Svg>
          </TouchableOpacity>
          <TouchableOpacity style={slotBarStyles.sendBtn} onPress={onSend}>
            <SendIcon color={colors.black} />
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
            <SendIcon color={colors.black} />
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
              <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <Path d="M7 16V4m0 0L3 8m4-4l4 4" /><Path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
              </Svg>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={slotBarStyles.sendBtn} onPress={onSend}>
            <SendIcon color={colors.black} />
            <Text style={slotBarStyles.sendText}>Envoyer</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const slotBarStyles = StyleSheet.create({
  bar: { height: 72, flexDirection: "row", gap: 12, marginTop: 8 },
  addBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.white, borderRadius: radii.lg },
  sendBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.white, borderRadius: radii.lg },
  sendText: { color: colors.black, fontFamily: typography.family.bold, fontSize: typography.size.md },
  thumbBtn: { flex: 1, borderRadius: radii.lg, overflow: "hidden" },
  badge: { position: "absolute", top: 8, right: 8, width: 18, height: 18, borderRadius: radii.full, backgroundColor: colors.white, justifyContent: "center", alignItems: "center" },
  badgeText: { color: colors.black, fontFamily: typography.family.bold, fontSize: typography.size.xs },
  swapOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", alignItems: "center" },
});

function TrashIcon() {
  return (
    <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 6h18" /><Path d="M19 6l-1 14H6L5 6" /><Path d="M8 6V4h8v2" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
  cameraPageContainer: { flex: 1, backgroundColor: colors.black, alignItems: "center" },
  cameraInner: { flex: 1, width: "100%" },
  flashBtn: { position: "absolute", top: 16, right: 16, width: 48, height: 48, borderRadius: radii.xl, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center" },
  textModeContainer: { flex: 1, justifyContent: "flex-start", backgroundColor: "#0A0A0A", paddingHorizontal: 32 },
  textModeInput: { color: colors.white, fontFamily: typography.family.bold, textAlign: "center", width: "100%", paddingTop: 0 },
  audioModeContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: 20, backgroundColor: "#0A0A0A" },
  audioProgressBar: { position: "absolute", left: 16, right: 16, height: 3, borderRadius: radii.xs, backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden" },
  audioProgressFill: { height: "100%", borderRadius: radii.xs, backgroundColor: "#A78BFA" },
  audioRecordingIndicator: { flexDirection: "row", alignItems: "center", gap: 12 },
  audioRedDot: { width: 10, height: 10, borderRadius: radii.full, backgroundColor: "#FF3B30" },
  audioTimerText: { color: colors.white, fontFamily: typography.family.bold, fontSize: typography.size.subtitle, letterSpacing: 2, width: 260, textAlign: "center" },
  audioHintText: { color: "rgba(255,255,255,0.3)", fontFamily: typography.family.regular, fontSize: typography.size.xs, letterSpacing: 0.5, marginTop: 4 },
  audioWaveformRow: { flexDirection: "row", alignItems: "center", gap: 4, height: 52 },
  audioWaveformBar: { width: 3.5, height: 44, borderRadius: radii.xs, backgroundColor: colors.white },
  cameraFooter: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: 24 },
  modeSlider: { flexDirection: "row", gap: 4, backgroundColor: "rgba(0,0,0,0.3)", paddingHorizontal: 20, paddingVertical: 4, borderRadius: radii.lg, marginBottom: 12 },
  modeText: { color: "rgba(255,255,255,0.4)", fontFamily: typography.family.bold, fontSize: typography.size.xs, paddingVertical: 10, paddingHorizontal: 8 },
  modeTextActive: { color: colors.white },
  drawingArea: { width: "100%", aspectRatio: 3 / 4, borderRadius: radii.xl, overflow: "hidden", backgroundColor: colors.white },
  drawingIdleOverlay: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  drawingHintText: { color: "rgba(0,0,0,0.25)", fontFamily: typography.family.regular, fontSize: typography.size.xs, letterSpacing: 0.5 },
  drawingToolbar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 12, paddingVertical: 10, borderRadius: radii.lg, marginBottom: 12 },
  drawingColorGrid: { flexDirection: "column", gap: 6 },
  drawingColorRow: { flexDirection: "row", gap: 6 },
  drawingColorDot: { width: 22, height: 22, borderRadius: radii.md, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.5)" },
  drawingColorDotActive: { transform: [{ scale: 1.35 }], borderColor: colors.white, shadowColor: colors.white, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 5, elevation: 6 },
  drawingBrushRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 16, marginTop: 4 },
  drawingBrushBtn: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
  drawingBrushDot: { borderWidth: 1.5, borderColor: "rgba(255,255,255,0.5)", opacity: 0.7 },
  drawingBrushDotActive: { opacity: 1, borderColor: colors.white, shadowColor: colors.white, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 4, elevation: 5 },
  drawingUndoBtn: { width: 32, height: 32, borderRadius: radii.lg, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center" },
  drawingUndoBtnDisabled: { backgroundColor: "rgba(255,255,255,0.06)" },
  drawingCancelBtn: { position: "absolute", left: 20, width: 40, height: 40, borderRadius: radii.lg, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  audioIdleTouchable: { flex: 1, justifyContent: "center", alignItems: "center", gap: 20 },
  captureRow: { flexDirection: "row", alignItems: "center", gap: 32 },
  sideControlPlaceholder: { width: 48 },
  flipBtn: { width: 48, height: 48, borderRadius: radii.xl, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center" },
  captureBtn: { width: 84, height: 84, borderRadius: radii.full, borderWidth: 5, borderColor: colors.white, justifyContent: "center", alignItems: "center" },
  captureBtnVideo: { borderColor: "rgba(255,59,48,0.5)" },
  captureBtnRecording: { borderColor: "#FF3B30" },
  captureBtnAudio: { borderColor: "rgba(255,255,255,0.4)" },
  captureBtnAudioRecording: { borderColor: colors.white },
  captureBtnValid: { borderColor: "#34C759" },
  captureInnerValid: { backgroundColor: "#34C759" },
  captureBtnDimmed: { borderColor: "rgba(255,255,255,0.2)" },
  captureInnerDimmed: { backgroundColor: "rgba(255,255,255,0.15)" },
  captureInner: { width: 66, height: 66, borderRadius: radii.full, backgroundColor: colors.white, justifyContent: "center", alignItems: "center" },
  captureInnerVideo: { backgroundColor: "#FF3B30" },
  captureInnerRecording: { width: 30, height: 30, borderRadius: radii.xs },
  captureInnerAudio: { backgroundColor: colors.white },
  captureInnerAudioRecording: { backgroundColor: colors.white, width: 28, height: 28, borderRadius: radii.xs },
  recordingTimer: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: radii.lg, gap: 8 },
  recordingDot: { width: 10, height: 10, borderRadius: radii.full, backgroundColor: "#FF3B30" },
  recordingText: { color: colors.white, fontFamily: typography.family.semibold, fontSize: typography.size.sm },
  processingText: { color: "rgba(255,255,255,0.6)", fontFamily: typography.family.semibold, fontSize: typography.size.sm },
  // Preview
  previewContainer: { flex: 1, backgroundColor: colors.black, alignItems: "center" },
  previewImageWrapper: { flex: 1, width: "100%", borderRadius: radii.xl, overflow: "hidden", backgroundColor: "#1A1A1A" },
  previewImage: { width: "100%", height: "100%" },
  drawingPreviewCenter: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-start", alignItems: "center" },
  drawingPreviewImage: { width: "100%", aspectRatio: 3 / 4, borderRadius: radii.xl, overflow: "hidden", backgroundColor: colors.white },
  previewTopBtns: { position: "absolute", top: 16, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" },
  topSquareBtn: { width: 38, height: 38, borderRadius: radii.sm, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center" },
  previewContent: { position: "absolute", left: 24, right: 24 },
  previewNoteBox: { backgroundColor: "rgba(0,0,0,0.5)", padding: 16, borderRadius: radii.lg, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  previewNoteText: { color: colors.white, fontSize: typography.size.md, fontFamily: typography.family.semibold, textAlign: "center" },
  addNoteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 16, borderRadius: radii.lg, backgroundColor: "rgba(0,0,0,0.4)", borderStyle: "dashed", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  addNoteBtnText: { color: "rgba(255,255,255,0.6)", fontSize: typography.size.sm, fontFamily: typography.family.semibold },
  noteEditorContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  largeNoteInput: { width: "100%", color: colors.white, fontSize: typography.size.xxl, fontFamily: typography.family.bold, textAlign: "center", marginBottom: 40 },
  doneNoteBtn: { backgroundColor: colors.white, paddingHorizontal: 32, paddingVertical: 14, borderRadius: radii.xl },
  doneNoteText: { color: colors.black, fontFamily: typography.family.bold, fontSize: typography.size.md },
  // Audio preview
  audioPreviewPlayer: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 32, paddingHorizontal: 24, width: "100%" },
  audioPreviewPlayBtn: { width: 52, height: 52, borderRadius: radii.full, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center" },
  audioPreviewSeekHitArea: { paddingVertical: 14, justifyContent: "center" },
  audioPreviewTrack: { height: 3, backgroundColor: "rgba(255,255,255,0.22)", borderRadius: radii.xs },
  audioPreviewFill: { height: 3, backgroundColor: colors.white, borderRadius: radii.xs },
  audioPreviewThumb: { position: "absolute", width: 13, height: 13, borderRadius: radii.sm, backgroundColor: colors.white, marginLeft: -6, top: 14 - 5 },
  audioPreviewTime: { fontSize: typography.size.xs, color: "rgba(255,255,255,0.5)", fontFamily: typography.family.regular },
  // Barre full-width de switch/envoi pendant la 2e capture
  capturingSecondBar: { position: "absolute", left: 12, right: 12, height: 72, flexDirection: "row", gap: 12 },
  capturingSecondThumb: { flex: 1, borderRadius: radii.lg, overflow: "hidden" },
  // Caption Audio
  captionRecordBtn: { width: 52, height: 52, borderRadius: radii.full, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  captionRecordBtnActive: { backgroundColor: "#FF3B30", borderColor: "#FF3B30", transform: [{ scale: 1.2 }] },
  captionRecordingOverlay: { position: "absolute", bottom: 80, left: 0, right: 0, alignItems: "center", gap: 10 },
  captionRecordingText: { color: colors.white, fontFamily: typography.family.bold, fontSize: typography.size.sm },
  captionAudioContainer: { marginBottom: 12 },
});

const challengeStyles = StyleSheet.create({
  topContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  btnWrapper: {
    backgroundColor: colors.black,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
    padding: 8,
  },
  challengeBtn: {
    backgroundColor: colors.white,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radii.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  challengeBtnText: {
    color: colors.black,
    fontFamily: typography.family.bold,
    fontSize: typography.size.sm,
  },
  bannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    backgroundColor: colors.black,
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
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  bannerTextWrapper: {
    flex: 1,
  },
  bannerText: {
    color: colors.white,
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

const pickerStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.78)", justifyContent: "center", alignItems: "center", padding: 28 },
  card: { backgroundColor: "#1C1C1E", borderRadius: radii.lg, padding: 24, width: "100%" },
  title: { fontSize: typography.size.lg, fontFamily: typography.family.bold, color: colors.white, marginBottom: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)" },
  checkbox: { width: 22, height: 22, borderRadius: radii.xs, borderWidth: 2, borderColor: "rgba(255,255,255,0.3)", justifyContent: "center", alignItems: "center" },
  checkboxOn: { backgroundColor: colors.white, borderColor: colors.white },
  groupName: { color: colors.white, fontFamily: typography.family.semibold, fontSize: typography.size.md, flex: 1 },
  sendBtn: { backgroundColor: colors.white, borderRadius: radii.md, paddingVertical: 14, alignItems: "center", marginTop: 20, marginBottom: 8 },
  sendBtnText: { color: colors.black, fontSize: typography.size.md, fontFamily: typography.family.bold },
  cancelWrap: { alignItems: "center", paddingVertical: 8 },
  cancelText: { color: "rgba(255,255,255,0.4)", fontFamily: typography.family.semibold, fontSize: typography.size.sm },
});

export default function CameraPage(props: Props) {
  return (
    <CameraErrorBoundary>
      <CameraPageInner {...props} />
    </CameraErrorBoundary>
  );
}
