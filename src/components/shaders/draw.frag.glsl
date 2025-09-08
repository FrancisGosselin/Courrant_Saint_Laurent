precision mediump float;

varying vec2 v_particle_pos;
varying float v_speed_magnitude;

void main() {
    // Hide particles with zero speed by setting alpha to 0
    // Use step function to avoid if statement: step(0.001, v_speed_magnitude) returns 0 if speed < 0.001, 1 otherwise
    float alpha = step(0.05, v_speed_magnitude) * 0.35;
    
    gl_FragColor = vec4(0.23, 0.23, 0.23, alpha);
}
