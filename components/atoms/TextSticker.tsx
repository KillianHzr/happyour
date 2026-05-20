import React from "react";
import { View } from "react-native";
import { Svg, Text as SvgText, Defs, Mask, Rect } from "react-native-svg";
import { colors, typography } from "../../lib/theme";

interface TextStickerProps {
  text: string;
  fontSize?: number;
  backgroundColor?: string;
}

export const TextSticker = ({
  text,
  fontSize = 42,
  backgroundColor = colors.brand
}: TextStickerProps) => {
  const displayValue = (text || "—").toUpperCase();

  // Extremely tight width/height calculations
  const height = fontSize * 1.05;
  const width = (displayValue.length * fontSize * 0.6) + 8;
  const xCenter = width / 2;
  const yCenter = height / 2;

  return (
    <Svg height={height} width={width} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <Mask id="knockoutMask">
          {/* White defines the shape of the pink rectangle */}
          <Rect width={width} height={height} fill={colors.white} />

          {/* Black cuts the text out of that shape */}
          <SvgText
            fill={colors.black}
            fontSize={fontSize}
            fontWeight={String(typography.weight.black)}
            fontFamily={typography.family.bold}
            x={xCenter}
            y={yCenter}
            textAnchor="middle"
            alignmentBaseline="central"
          >
            {displayValue}
          </SvgText>
        </Mask>
      </Defs>

      {/* The pink rectangle with the text hole cut out */}
      <Rect
        width={width}
        height={height}
        fill={backgroundColor}
        mask="url(#knockoutMask)"
      />
    </Svg>
  );
};
