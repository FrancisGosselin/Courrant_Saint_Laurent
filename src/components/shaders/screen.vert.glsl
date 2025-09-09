precision mediump float;

attribute vec2 a_pos;
uniform mat4 u_matrix;
uniform vec4 u_viewport_normalized_bounds;

varying vec2 v_tex_pos;

void main() {
    v_tex_pos = a_pos;
    gl_Position = vec4(1.0 - 2.0 * a_pos, 0, 1);
}