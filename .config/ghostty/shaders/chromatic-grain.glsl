// Chromatic flow: smooth, flowing pools of colored ink.
// Use instead of space.glsl, before any cursor shader.
#define CHROMATIC_BRIGHTNESS 0.22 // color intensity on an opaque background
#define CHROMATIC_SPEED      0.18 // visible drift; 0.0 freezes the color field
#define CHROMATIC_TRANSPARENCY_BOOST 0.7 // extra color as the background becomes transparent
#define CHROMATIC_COVERAGE   0.12 // translucent pigment behind the terminal; 0.0 disables it
#define CHROMATIC_MAX_LUMA   0.065 // limits added brightness when pigments overlap

float chromaticNoiseHash(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

float chromaticValueNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    vec2 blend = f * f * (3.0 - 2.0 * f);
    return mix(mix(chromaticNoiseHash(cell), chromaticNoiseHash(cell + vec2(1.0, 0.0)), blend.x),
               mix(chromaticNoiseHash(cell + vec2(0.0, 1.0)),
                   chromaticNoiseHash(cell + vec2(1.0)), blend.x), blend.y);
}

// Estimate the surface opacity from dispersed samples, independent of each glyph.
// Text can raise alpha above the background; the lowest sample finds clear space.
float chromaticSurfaceAlpha() {
    float backgroundAlpha = 1.0;
    for (int y = 0; y < 3; y++) {
        for (int x = 0; x < 3; x++) {
            vec2 sampleUV = (vec2(float(x), float(y)) + 0.5) / 3.0;
            backgroundAlpha = min(backgroundAlpha, texture(iChannel0, sampleUV).a);
        }
    }
    return clamp(backgroundAlpha, 0.0, 1.0);
}

// Composites moving pigment into dark pixels, with a translucent layer behind them.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime * CHROMATIC_SPEED;
    // Advect the whole field while each pigment deforms at its own rate.
    vec2 warp = vec2(chromaticValueNoise(p * 1.4 + vec2(t * 0.65, 3.0)),
                     chromaticValueNoise(p * 1.4 + vec2(7.0, -t * 0.55)));
    vec2 flow = p * 1.5 + (warp - 0.5) * 2.2 + vec2(t * 0.32, -t * 0.16);
    float inkA = chromaticValueNoise(flow + vec2(t * 0.15, 0.0));
    float inkB = chromaticValueNoise(flow * 1.15 + vec2(4.2, t * 0.20));
    float inkC = chromaticValueNoise(flow * 0.8 + vec2(-t * 0.12, 8.4));

    // Separate pigment pools leave generous dark space between the colors.
    float coral = smoothstep(0.42, 0.82, inkA);
    float cobalt = smoothstep(0.38, 0.80, inkB);
    float plum = smoothstep(0.45, 0.85, inkC);
    vec3 pigment = vec3(0.82, 0.30, 0.20) * coral;
    pigment += vec3(0.16, 0.36, 0.85) * cobalt;
    pigment += vec3(0.46, 0.21, 0.49) * plum;
    float negativeSpace = 0.30 + 0.70 * smoothstep(0.22, 0.68,
        chromaticValueNoise(p * 0.9 + vec2(12.0, t * 0.25)));
    pigment *= negativeSpace;

    vec4 terminal = texture(iChannel0, uv);
    float terminalAlpha = clamp(terminal.a, 0.0, 1.0);
    float surfaceAlpha = chromaticSurfaceAlpha();

    // Recover the uncovered fraction from alpha, rather than cutting holes around
    // glyphs. Antialiased edges receive exactly their share of the new background.
    float backgroundWeight;
    if (surfaceAlpha < 0.995) {
        backgroundWeight = clamp((1.0 - terminalAlpha) / (1.0 - surfaceAlpha), 0.0, 1.0);
    } else {
        // Fully opaque input has lost glyph alpha. Use a continuous color estimate
        // without thresholds or a neighborhood mask that could outline letters.
        vec3 difference = abs(terminal.rgb - iBackgroundColor.rgb);
        backgroundWeight = 1.0 - clamp(max(difference.r, max(difference.g, difference.b)) / 0.45, 0.0, 1.0);
    }
    float visibilityBoost = 1.0 + CHROMATIC_TRANSPARENCY_BOOST
                         * pow(1.0 - surfaceAlpha, 0.7);
    vec3 glow = pigment * CHROMATIC_BRIGHTNESS * visibilityBoost;
    float glowLuma = dot(glow, vec3(0.2126, 0.7152, 0.0722));
    glow *= min(1.0, CHROMATIC_MAX_LUMA / max(glowLuma, 0.0001));

    // Give the pigment a little coverage of its own instead of forcing an opaque
    // background. At 85% terminal opacity, this adds at most 1.8 percentage points.
    float pigmentStrength = max(pigment.r, max(pigment.g, pigment.b));
    float pigmentCoverage = clamp(CHROMATIC_COVERAGE, 0.0, 1.0)
                          * smoothstep(0.01, 0.40, pigmentStrength);
    float behindAlpha = (1.0 - terminalAlpha) * pigmentCoverage;
    float outputAlpha = terminalAlpha + behindAlpha;
    vec3 behindColor = clamp(iBackgroundColor.rgb + glow, 0.0, 1.0);
    vec3 color = terminal.rgb + glow * surfaceAlpha * backgroundWeight;
    color += behindColor * behindAlpha;

    // Keep valid premultiplied output even at zero background opacity.
    fragColor = vec4(clamp(color, vec3(0.0), vec3(outputAlpha)), outputAlpha);
}
