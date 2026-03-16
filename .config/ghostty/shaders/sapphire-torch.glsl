float getSdfRectangle(in vec2 p, in vec2 xy, in vec2 b)
{
    vec2 d = abs(p - xy) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// Based on Inigo Quilez's 2D distance functions article: https://iquilezles.org/articles/distfunctions2d/
// Potencially optimized by eliminating conditionals and loops to enhance performance and reduce branching

float seg(in vec2 p, in vec2 a, in vec2 b, inout float s, float d) {
    vec2 e = b - a;
    vec2 w = p - a;
    vec2 proj = a + e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    float segd = dot(p - proj, p - proj);
    d = min(d, segd);

    float c0 = step(0.0, p.y - a.y);
    float c1 = 1.0 - step(0.0, p.y - b.y);
    float c2 = 1.0 - step(0.0, e.x * w.y - e.y * w.x);
    float allCond = c0 * c1 * c2;
    float noneCond = (1.0 - c0) * (1.0 - c1) * (1.0 - c2);
    float flip = mix(1.0, -1.0, step(0.5, allCond + noneCond));
    s *= flip;
    return d;
}

float getSdfParallelogram(in vec2 p, in vec2 v0, in vec2 v1, in vec2 v2, in vec2 v3) {
    float s = 1.0;
    float d = dot(p - v0, p - v0);

    d = seg(p, v0, v3, s, d);
    d = seg(p, v1, v0, s, d);
    d = seg(p, v2, v1, s, d);
    d = seg(p, v3, v2, s, d);

    return s * sqrt(d);
}

vec2 normalize(vec2 value, float isPosition) {
    return (value * 2.0 - (iResolution.xy * isPosition)) / iResolution.y;
}

float antialising(float distance) {
    return 1. - smoothstep(0., normalize(vec2(2., 2.), 0.).x, distance);
}

float determineStartVertexFactor(vec2 a, vec2 b) {
    // Conditions using step
    float condition1 = step(b.x, a.x) * step(a.y, b.y); // a.x < b.x && a.y > b.y
    float condition2 = step(a.x, b.x) * step(b.y, a.y); // a.x > b.x && a.y < b.y

    // If neither condition is met, return 1 (else case)
    return 1.0 - max(condition1, condition2);
}

vec2 getRectangleCenter(vec4 rectangle) {
    return vec2(rectangle.x + (rectangle.z / 2.), rectangle.y - (rectangle.w / 2.));
}
float ease(float x) {
    return pow(1.0 - x, 2.5);
}
vec4 saturate(vec4 color, float factor) {
    float gray = dot(color, vec4(0.299, 0.587, 0.114, 0.)); // luminance
    return mix(vec4(gray), color, factor);
}

// Pseudo-random hash for particle positions
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

const int PARTICLE_COUNT = 9;
const float PARTICLE_SIZE = 0.008;
const float PARTICLE_DRIFT = 0.10; // how far embers rise
const float PARTICLE_SPREAD = 0.03; // lateral scatter
const float PARTICLE_LIFETIME = 1.05; // seconds, independent of trail DURATION
const float PARTICLE_MIN_DIST = 0.22; // minimum travel distance to spawn particles

vec4 TRAIL_COLOR = vec4(0.15, 0.25, 0.85, 1.0); // sapphire blue
const float OPACITY = 0.6;
const float DURATION = 0.4; //IN SECONDS
const float TRAIL_SCALE = 1.8;
const float TAPER = 0.6; // 0 = no taper, 1 = full point
const float GLOW_RADIUS = 0.015; // how far the glow extends
const float GLOW_INTENSITY = 0.35; // glow brightness
const float SPEED_REF = 0.15; // reference distance for "normal" speed
const float DISTORT_STRENGTH = 0.0007; // heat shimmer intensity
const float FLAME_REFLECT_SPEED = 2.0;  // how fast reflections sweep
const float FLAME_REFLECT_INTENSITY = 0.3; // reflection brightness
const float SMOKE_OPACITY = 0.15; // smoke darkness
const float SMOKE_LIFETIME = 0.8; // how long smoke lingers (seconds)

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{

    // Normalization for fragCoord to a space of -1 to 1;
    vec2 vu = normalize(fragCoord, 1.);

    // Heat distortion: warp UV near the trail before sampling background
    vec2 centerCC_early = normalize(iCurrentCursor.xy + iCurrentCursor.zw * vec2(0.5, -0.5), 1.);
    vec2 centerCP_early = normalize(iPreviousCursor.xy + iPreviousCursor.zw * vec2(0.5, -0.5), 1.);
    vec2 toTrail = vu - mix(centerCC_early, centerCP_early, 0.5);
    float distFromTrail = length(toTrail);
    float heatTime = iTime - iTimeCursorChange;
    float earlyDist = distance(centerCC_early, centerCP_early);
    float heatActive = smoothstep(DURATION * 2.0, 0.0, heatTime) * step(PARTICLE_MIN_DIST, earlyDist);
    vec2 distortion = vec2(
        sin(vu.y * 80.0 + iTime * 15.0) * cos(vu.x * 60.0 + iTime * 11.0),
        cos(vu.y * 70.0 + iTime * 13.0)
    ) * DISTORT_STRENGTH * heatActive * exp(-distFromTrail * 15.0);
    vec2 distortedUV = fragCoord.xy / iResolution.xy + distortion;

    #if !defined(WEB)
    fragColor = texture(iChannel0, distortedUV);
    #endif
    vec2 offsetFactor = vec2(-.5, 0.5);

    // Normalization for cursor position and size;
    // cursor xy has the postion in a space of -1 to 1;
    // zw has the width and height
    vec4 currentCursor = vec4(normalize(iCurrentCursor.xy, 1.), normalize(iCurrentCursor.zw, 0.));
    vec4 previousCursor = vec4(normalize(iPreviousCursor.xy, 1.), normalize(iPreviousCursor.zw, 0.));

    // When drawing a parellelogram between cursors for the trail i need to determine where to start at the top-left or top-right vertex of the cursor
    float vertexFactor = determineStartVertexFactor(currentCursor.xy, previousCursor.xy);
    float invertedVertexFactor = 1.0 - vertexFactor;

    // Set every vertex of my parellogram
    vec2 v0 = vec2(currentCursor.x + currentCursor.z * vertexFactor, currentCursor.y - currentCursor.w);
    vec2 v1 = vec2(currentCursor.x + currentCursor.z * invertedVertexFactor, currentCursor.y);
    vec2 v2 = vec2(previousCursor.x + currentCursor.z * invertedVertexFactor, previousCursor.y);
    vec2 v3 = vec2(previousCursor.x + currentCursor.z * vertexFactor, previousCursor.y - previousCursor.w);

    // Taper: pinch tail vertices toward center of previous cursor
    vec2 tailCenter = vec2(previousCursor.x + currentCursor.z * 0.5, previousCursor.y - previousCursor.w * 0.5);
    v2 = mix(v2, tailCenter, TAPER);
    v3 = mix(v3, tailCenter, TAPER);

    float sdfCurrentCursor = getSdfRectangle(vu, currentCursor.xy - (currentCursor.zw * offsetFactor), currentCursor.zw * 0.5);
    float sdfTrail = getSdfParallelogram(vu, v0, v1, v2, v3);

    float progress = clamp((iTime - iTimeCursorChange) / DURATION, 0.0, 1.0);
    float easedProgress = ease(progress);
    // Distance between cursors determine the total length of the parallelogram;
    vec2 centerCC = getRectangleCenter(currentCursor);
    vec2 centerCP = getRectangleCenter(previousCursor);
    float lineLength = distance(centerCC, centerCP);

    // Speed factor: >1 when fast, <1 when slow
    float speed = clamp(lineLength / SPEED_REF, 0.5, 1.5);

    // Gradient fade: compute position along trail (0 = head, 1 = tail)
    vec2 trailDir = centerCP - centerCC;
    float trailParam = (lineLength > 0.001)
        ? clamp(dot(vu - centerCC, trailDir) / dot(trailDir, trailDir), 0.0, 1.0)
        : 0.0;
    float trailFade = 1.0 - smoothstep(0.0, 1.0, trailParam);

    vec4 newColor = vec4(fragColor);

    vec4 trail = TRAIL_COLOR;
    trail = saturate(trail, 2.5);
    // Color temperature: bright cyan-white at head → deep blue at tail
    vec4 hotColor = trail + vec4(0.1, 0.2, 0.4, 0.0);       // bright cyan-white at head
    vec4 coolColor = vec4(0.05, 0.08, 0.5, 1.0);            // deep sapphire at tail
    vec4 tempTrail = mix(hotColor, coolColor, trailParam);
    // Flickering: noise-based intensity variation over time and position
    float flicker = 0.85 + 0.15 * sin(iTime * 25.0 + trailParam * 12.0)
                        * sin(iTime * 17.3 + trailParam * 8.0);
    // Draw soft glow around trail
    float softSpeed = mix(1.0, speed, 1.3);
    float glow = exp(-max(sdfTrail, 0.0) / (GLOW_RADIUS * softSpeed)) * GLOW_INTENSITY * softSpeed * trailFade * flicker;
    newColor = mix(newColor, tempTrail, glow);
    // Draw trail with gradient fade
    newColor = mix(newColor, tempTrail, antialising(sdfTrail) * trailFade * flicker);
    // Inner core: bright white-hot center line
    float coreDist = abs(sdfTrail); // distance from trail edge (negative = inside)
    float coreWidth = currentCursor.w * 0.15; // thin line relative to cursor height
    float core = exp(-coreDist / coreWidth) * trailFade * flicker * step(sdfTrail, 0.0);
    vec4 coreColor = vec4(0.8, 0.9, 1.0, 1.0); // white-blue core
    newColor = mix(newColor, coreColor, core * 0.6);
    // Draw current cursor
    newColor = mix(newColor, trail, antialising(sdfCurrentCursor));
    // Tint cursor interior blue to override native (red) cursor color from framebuffer
    vec4 cursorFill = mix(fragColor, vec4(TRAIL_COLOR.rgb, fragColor.a), 0.7);
    newColor = mix(newColor, cursorFill, step(sdfCurrentCursor, 0.));

    // Typing pulse: cursor glow that expands and contracts on each keystroke
    float typePulse = easedProgress; // 1 at keystroke, eases to 0
    float pulseRadius = typePulse * 0.03;
    float cursorGlow = exp(-max(sdfCurrentCursor, 0.0) / max(pulseRadius, 0.001)) * typePulse;
    vec4 pulseColor = trail + vec4(0.0, 0.1, 0.15, 0.0);
    newColor = mix(newColor, pulseColor, cursorGlow * 0.5);

    // Flame reflections: bright highlights sweeping across cursor
    float insideCursor = step(sdfCurrentCursor, 0.0);
    if (insideCursor > 0.5) {
        vec2 curCenter = currentCursor.xy - (currentCursor.zw * offsetFactor);
        vec2 localPos = (vu - curCenter) / (currentCursor.zw * 0.5);

        // Wave 1: white-hot highlight
        float a1 = localPos.x * 2.5 + localPos.y * 1.5 + iTime * FLAME_REFLECT_SPEED;
        float w1 = pow(sin(a1) * 0.5 + 0.5, 2.0);
        vec3 hot = vec3(0.5, 0.8, 1.0); // bright ice-blue

        // Wave 2: deep sapphire
        float a2 = localPos.x * 1.2 - localPos.y * 2.0 + iTime * FLAME_REFLECT_SPEED * 0.6;
        float w2 = sin(a2) * 0.5 + 0.5;
        vec3 deep = vec3(0.05, 0.1, 0.7); // deep blue

        // Wave 3: cyan
        float a3 = localPos.x * 1.8 + localPos.y * 2.5 + iTime * FLAME_REFLECT_SPEED * 1.3;
        float w3 = sin(a3) * 0.5 + 0.5;
        vec3 cyan = vec3(0.1, 0.8, 0.9); // vivid cyan

        // Wave 4: indigo-violet
        float a4 = localPos.x * 0.8 + localPos.y * 3.0 + iTime * FLAME_REFLECT_SPEED * 0.9;
        float w4 = sin(a4) * 0.5 + 0.5;
        vec3 indigo = vec3(0.3, 0.1, 0.8);

        // Combine all four waves
        vec3 reflect = mix(deep, hot, w1);
        reflect = mix(reflect, cyan, w3 * 0.5);
        reflect = mix(reflect, indigo, w4 * 0.35);
        // Blend reflections with text underneath
        newColor.rgb = mix(newColor.rgb, reflect, 0.75);
    }
    // Smoke wisp: dark residue that lingers after the flame
    float smokeTime = clamp(heatTime / SMOKE_LIFETIME, 0.0, 1.0);
    float smokeFade = pow(1.0 - smokeTime, 2.0) * smoothstep(0.0, 0.15, heatTime); // fade in then out
    float smokeNoise = 0.7 + 0.3 * sin(vu.x * 50.0 + iTime * 3.0) * sin(vu.y * 40.0 + iTime * 2.3);
    float smokeShape = exp(-max(sdfTrail, 0.0) / 0.02) * smokeFade * smokeNoise;
    vec4 smokeColor = vec4(0.02, 0.03, 0.08, 1.0); // dark cool smoke
    newColor = mix(newColor, smokeColor, smokeShape * SMOKE_OPACITY);

    // Ember particles along the trail (only for longer movements)
    float particleAlpha = 0.0;
    vec4 particleColor = vec4(0.0);
    float timeSinceChange = iTime - iTimeCursorChange;
    if (lineLength > PARTICLE_MIN_DIST)
    for (int i = 0; i < PARTICLE_COUNT; i++) {
        float id = float(i);
        float seed = hash(vec2(id, iTimeCursorChange * 17.3));
        float t = seed; // position along trail 0..1
        // Spawn point: interpolate between cursor centers
        vec2 spawnPos = mix(centerCC, centerCP, t);
        // Lateral scatter
        float side = (hash(vec2(id * 3.7, seed)) - 0.5) * 2.0;
        spawnPos.x += side * PARTICLE_SPREAD;
        // Drift upward over time, each particle at its own speed
        float driftSpeed = 0.5 + hash(vec2(id, seed * 7.1)) * 0.5;
        spawnPos.y += timeSinceChange * PARTICLE_DRIFT * driftSpeed;
        // Particle lifetime: fade in quickly, fade out
        float life = clamp(timeSinceChange / (PARTICLE_LIFETIME * (0.5 + seed)), 0.0, 1.0);
        float fadeOut = pow(1.0 - life, 0.5);
        float fadeIn = smoothstep(0.0, 0.1, timeSinceChange);
        // Size shrinks as it fades
        float size = PARTICLE_SIZE * (0.5 + 0.5 * seed) * fadeOut / speed;
        float d = length(vu - spawnPos);
        float ember = smoothstep(size, size * 0.3, d) * fadeOut * fadeIn;
        // Cool color shift: brighter/cyan embers
        vec4 emberCol = trail + vec4(0.0, 0.15 * seed, 0.3 * seed, 0.0);
        particleColor += emberCol * ember;
        particleAlpha += ember;
    }
    particleAlpha = clamp(particleAlpha, 0.0, 1.0);

    // newColor = mix(fragColor, newColor, OPACITY);
    // Smooth transition instead of hard step; skip trail for tiny movements
    float trailRadius = easedProgress * lineLength * TRAIL_SCALE * softSpeed;
    float trailMask = (lineLength > 0.005)
        ? smoothstep(trailRadius + 0.005, trailRadius - 0.005, sdfCurrentCursor)
        : step(sdfCurrentCursor, 0.0);
    fragColor = mix(fragColor, newColor, trailMask);

    // Render particles on top, independent of trail mask
    fragColor = mix(fragColor, particleColor, particleAlpha);
}
