const float GLASS_TINT = 0.35;           // how much white tint on glass
const float GLASS_BLUR_RADIUS = 0.003;   // fake blur sampling radius
const float RAINBOW_SPEED = 1.5;         // reflection animation speed
const float RAINBOW_INTENSITY = 0.25;    // reflection brightness
const float BORDER_WIDTH = 0.0015;       // glass border thickness
const float BORDER_GLOW = 0.004;         // soft glow on border
const float TRAIL_DURATION = 0.65;       // rainbow trail fade time
const float TRAIL_OPACITY = 0.6;         // smear visibility
const float SPEED_REF = 0.15;            // reference distance for normal speed
const float SQUASH = 0.75;              // scale while traveling (smaller)
const float STRETCH = 1.2;              // scale on landing (bigger)
const float SETTLE_TIME = 0.25;          // seconds to bounce back to normal

vec2 normalizePos(vec2 value, float isPosition) {
    return (value * 2.0 - (iResolution.xy * isPosition)) / iResolution.y;
}

float getSdfRect(vec2 p, vec2 center, vec2 halfSize) {
    vec2 d = abs(p - center) - halfSize;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

vec3 hsv2rgb(float h, float s, float v) {
    vec3 c = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return v * mix(vec3(1.0), c, s);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = fragCoord.xy / iResolution.xy;
    vec2 vu = normalizePos(fragCoord, 1.0);
    vec2 pixelSize = 1.0 / iResolution.xy;

    #if !defined(WEB)
    fragColor = texture(iChannel0, uv);
    #endif

    // Cursor in normalized space
    vec4 cur = vec4(normalizePos(iCurrentCursor.xy, 1.0), normalizePos(iCurrentCursor.zw, 0.0));
    vec2 curCenter = cur.xy - vec2(-cur.z * 0.5, cur.w * 0.5);
    vec2 curHalf = cur.zw * 0.5;

    vec4 prev = vec4(normalizePos(iPreviousCursor.xy, 1.0), normalizePos(iPreviousCursor.zw, 0.0));
    vec2 prevCenter = prev.xy - vec2(-prev.z * 0.5, prev.w * 0.5);

    float travelDist = distance(curCenter, prevCenter);
    float timeSince = iTime - iTimeCursorChange;

    // --- SIMPLE COLOR SMEAR TRAIL ---
    float speed = clamp(travelDist / SPEED_REF, 0.3, 1.3);

    if (travelDist > 0.01 && timeSince < TRAIL_DURATION) {
        float trailFade = pow(1.0 - clamp(timeSince / TRAIL_DURATION, 0.0, 1.0), 2.0);

        // Parallelogram between prev and current cursor
        // Use cursor height for trail thickness, tapered at tail
        vec2 ba = curCenter - prevCenter;
        vec2 dir = normalize(ba);
        vec2 perp = vec2(-dir.y, dir.x);
        vec2 pa = vu - prevCenter;
        float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        vec2 closest = prevCenter + ba * t;
        float distToLine = length(vu - closest);

        // Taper from full cursor height at head to a point at tail
        float halfHeight = cur.w * 0.5;
        float taperWidth = halfHeight * mix(0.1, 1.0, t);

        // Soft smear shape
        float smear = smoothstep(taperWidth, taperWidth * 0.5, distToLine) * trailFade;

        // Gradient fade: bright at head, dim at tail
        float alongFade = mix(0.2, 1.0, t);
        smear *= alongFade;

        // Smear color: cursor color with rainbow tint
        vec3 smearColor = iCurrentCursorColor.rgb;
        float hue = fract(t * 0.8 + iTime * 0.3);
        vec3 rainbow = hsv2rgb(hue, 0.35, 1.0);
        smearColor = mix(smearColor, rainbow, 0.3);

        fragColor.rgb = mix(fragColor.rgb, smearColor, smear * TRAIL_OPACITY * speed);
    }

    // --- GLASSMORPHISM CURSOR ---
    // Squash while moving, stretch on landing, settle back
    float landProgress = clamp(timeSince / SETTLE_TIME, 0.0, 1.0);
    // Bounce: overshoot to STRETCH then ease back to 1.0
    float bounce = STRETCH + (1.0 - STRETCH) * landProgress;
    // If still very early (traveling), squash instead
    float isMoving = 1.0 - smoothstep(0.0, 0.05, timeSince);
    float cursorScale = mix(bounce, SQUASH, isMoving);

    vec2 scaledHalf = curHalf * cursorScale;
    float sdf = getSdfRect(vu, curCenter, scaledHalf);

    if (sdf < BORDER_GLOW * 3.0) {
        // Fake blur: average nearby samples for frosted glass effect
        vec3 blurred = vec3(0.0);
        float samples = 0.0;
        for (int x = -2; x <= 2; x++) {
            for (int y = -2; y <= 2; y++) {
                vec2 offset = vec2(float(x), float(y)) * GLASS_BLUR_RADIUS;
                vec2 sampleUV = uv + offset;
                #if !defined(WEB)
                blurred += texture(iChannel0, sampleUV).rgb;
                #endif
                samples += 1.0;
            }
        }
        blurred /= samples;

        // Inside cursor
        float inside = 1.0 - smoothstep(-0.001, 0.001, sdf);

        // Glass base: blurred background + white tint
        vec3 glass = mix(blurred, vec3(1.0), GLASS_TINT);

        // Animated rainbow reflections sweeping across the glass
        vec2 localPos = (vu - curCenter) / curHalf; // -1 to 1 within cursor
        float reflectAngle = localPos.x * 2.0 + localPos.y * 1.5 + iTime * RAINBOW_SPEED;
        float reflectWave = sin(reflectAngle) * 0.5 + 0.5;
        float reflectHue = fract(reflectAngle * 0.15 + iTime * 0.2);
        vec3 reflection = hsv2rgb(reflectHue, 0.45, 1.0);

        // Reflection is subtle, like light moving across glass
        glass = mix(glass, reflection, RAINBOW_INTENSITY * reflectWave);

        // Apply glass to cursor area (keep text readable)
        fragColor.rgb = mix(fragColor.rgb, glass, inside * 0.45);

        // Glass border: bright thin edge
        float border = exp(-abs(sdf) / BORDER_WIDTH);
        vec3 borderColor = vec3(1.0, 1.0, 1.0);
        fragColor.rgb = mix(fragColor.rgb, borderColor, border * 0.6 * inside);

        // Outer glow on border
        float outerGlow = exp(-max(sdf, 0.0) / BORDER_GLOW) * 0.2;
        float glowHue = fract(iTime * 0.3);
        vec3 glowColor = hsv2rgb(glowHue, 0.5, 1.0);
        fragColor.rgb = mix(fragColor.rgb, glowColor, outerGlow);
    }
}
