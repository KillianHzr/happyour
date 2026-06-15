import React from "react";
import { Svg, Text as SvgText, Defs, Mask, Rect } from "react-native-svg";
import { colors as staticColors, typography } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";

interface TextStickerProps {
  text: string;
  fontSize?: number;
  backgroundColor?: string;
}

export const TextSticker = ({
  text,
  fontSize = 42,
  backgroundColor,
}: TextStickerProps) => {
  const { colors } = useTheme();
  const bg = backgroundColor ?? colors.brand;
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
          {/* White defines the shape of the rectangle (mask color — must stay literal) */}
          <Rect width={width} height={height} fill={staticColors.white} />

          {/* Black cuts the text out of that shape (mask color — must stay literal) */}
          <SvgText
            fill={staticColors.black}
            fontSize={fontSize}
            fontFamily={typography.familyPS.bold}
            x={xCenter}
            y={yCenter}
            textAnchor="middle"
            alignmentBaseline="central"
          >
            {displayValue}
          </SvgText>
        </Mask>
      </Defs>

      {/* The colored rectangle with the text hole cut out */}
      <Rect
        width={width}
        height={height}
        fill={bg}
        mask="url(#knockoutMask)"
      />
    </Svg>
  );
};
