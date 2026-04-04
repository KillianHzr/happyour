import React, { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";
import { View, StyleSheet, PanResponder } from "react-native";
import { Canvas, Path, Fill, Skia, useCanvasRef } from "@shopify/react-native-skia";
import * as FileSystem from "expo-file-system/legacy";

const STROKE_WIDTH = 6;

export interface DrawingCanvasRef {
  capture: () => Promise<string | null>;
  undo: () => void;
  redo: () => void;
}

type Point = { x: number; y: number };
type Stroke = {
  path: ReturnType<typeof Skia.Path.Make>;
  color: string;
};

export const DrawingCanvas = forwardRef<DrawingCanvasRef, { color: string }>(
  ({ color }, ref) => {
    const canvasRef = useCanvasRef();
    const canvasViewRef = useRef<View>(null);
    const canvasLayoutRef = useRef({ pageX: 0, pageY: 0 });

    const [completedStrokes, setCompletedStrokes] = useState<Stroke[]>([]);
    const [, forceUpdate] = useState(0);

    const activeStrokeRef = useRef<Stroke | null>(null);
    const lastPointRef = useRef<Point | null>(null);
    const selectedColorRef = useRef(color);
    const redoStackRef = useRef<Stroke[]>([]);

    useEffect(() => {
      selectedColorRef.current = color;
    }, [color]);

    useImperativeHandle(ref, () => ({
      capture: async () => {
        const image = canvasRef.current?.makeImageSnapshot();
        if (!image) return null;
        const base64 = image.encodeToBase64();
        const uri = `${FileSystem.cacheDirectory}drawing_${Date.now()}.jpg`;
        await FileSystem.writeAsStringAsync(uri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return uri;
      },
      undo: () => {
        setCompletedStrokes((prev) => {
          if (prev.length === 0) return prev;
          redoStackRef.current = [...redoStackRef.current, prev[prev.length - 1]];
          return prev.slice(0, -1);
        });
      },
      redo: () => {
        const next = redoStackRef.current[redoStackRef.current.length - 1];
        if (!next) return;
        redoStackRef.current = redoStackRef.current.slice(0, -1);
        setCompletedStrokes((prev) => [...prev, next]);
      },
    }));

    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: (evt) => {
          const x = evt.nativeEvent.pageX - canvasLayoutRef.current.pageX;
          const y = evt.nativeEvent.pageY - canvasLayoutRef.current.pageY;
          const path = Skia.Path.Make();
          path.moveTo(x, y);
          lastPointRef.current = { x, y };
          activeStrokeRef.current = { path, color: selectedColorRef.current };
          forceUpdate((n) => n + 1);
        },
        onPanResponderMove: (evt) => {
          if (!activeStrokeRef.current) return;
          const x = evt.nativeEvent.pageX - canvasLayoutRef.current.pageX;
          const y = evt.nativeEvent.pageY - canvasLayoutRef.current.pageY;
          const last = lastPointRef.current;
          if (last) {
            const midX = (last.x + x) / 2;
            const midY = (last.y + y) / 2;
            activeStrokeRef.current.path.quadTo(last.x, last.y, midX, midY);
          }
          lastPointRef.current = { x, y };
          forceUpdate((n) => n + 1);
        },
        onPanResponderRelease: () => {
          if (activeStrokeRef.current) {
            const stroke = activeStrokeRef.current;
            redoStackRef.current = []; // new stroke clears redo history
            setCompletedStrokes((prev) => [...prev, stroke]);
            activeStrokeRef.current = null;
            lastPointRef.current = null;
          }
        },
        onPanResponderTerminate: () => {
          activeStrokeRef.current = null;
          lastPointRef.current = null;
        },
      })
    ).current;

    return (
      <View
        ref={canvasViewRef}
        style={StyleSheet.absoluteFill}
        onLayout={() => {
          canvasViewRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
            canvasLayoutRef.current = { pageX, pageY };
          });
        }}
        {...panResponder.panHandlers}
      >
        <Canvas ref={canvasRef} style={StyleSheet.absoluteFill}>
          <Fill color="#0A0A0A" />
          {completedStrokes.map((stroke, i) => (
            <Path
              key={i}
              path={stroke.path}
              color={stroke.color}
              style="stroke"
              strokeWidth={STROKE_WIDTH}
              strokeCap="round"
              strokeJoin="round"
            />
          ))}
          {activeStrokeRef.current && (
            <Path
              path={activeStrokeRef.current.path}
              color={activeStrokeRef.current.color}
              style="stroke"
              strokeWidth={STROKE_WIDTH}
              strokeCap="round"
              strokeJoin="round"
            />
          )}
        </Canvas>
      </View>
    );
  }
);

DrawingCanvas.displayName = "DrawingCanvas";
export default DrawingCanvas;

const styles = StyleSheet.create({});
