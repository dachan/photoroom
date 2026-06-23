// WebGL2 implementation of the Renderer interface.
//
// Pipeline per render:
//   source (RGB16UI integer texture, NEAREST)
//     --ingest pass-->  linear float texture (RGBA16F, LINEAR)
//     --develop pass--> target framebuffer (canvas preview, or RGBA8 export FBO)
//
// Rendering to a sized target downsizes for an interactive preview; export runs
// the same passes at the image's native resolution into an offscreen FBO.

import type { DecodedImage, EditParams, EmbeddedLensFactors } from "@/lib/types";
import type { ExportResult, Renderer } from "@/lib/pipeline/renderer";
import { toDevelopUniforms } from "@/lib/pipeline/develop";
import { DEVELOP_FRAG_SRC, INGEST_FRAG_SRC, VERTEX_SRC } from "@/lib/pipeline/webgl2/shaders";

const MAX_PREVIEW_LONG_EDGE = 2560;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

function linkProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }
  return program;
}

export class WebGL2Renderer implements Renderer {
  private gl: WebGL2RenderingContext;
  private ingestProgram: WebGLProgram;
  private developProgram: WebGLProgram;
  private vao: WebGLVertexArrayObject;

  private sourceTex: WebGLTexture | null = null;
  private linearTex: WebGLTexture | null = null;
  private linearFbo: WebGLFramebuffer | null = null;
  private linearSize = { w: 0, h: 0 };

  private image: DecodedImage | null = null;
  private embedded: EmbeddedLensFactors | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      preserveDrawingBuffer: false,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error("WebGL2 is not available in this browser.");
    if (!gl.getExtension("EXT_color_buffer_float")) {
      throw new Error("EXT_color_buffer_float is required but not supported.");
    }
    this.gl = gl;
    this.ingestProgram = linkProgram(gl, VERTEX_SRC, INGEST_FRAG_SRC);
    this.developProgram = linkProgram(gl, VERTEX_SRC, DEVELOP_FRAG_SRC);
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Failed to create VAO");
    this.vao = vao;
  }

  loadImage(image: DecodedImage): void {
    const gl = this.gl;
    this.image = image;
    this.embedded = image.lensCorrection;
    this.disposeSource();

    const tex = gl.createTexture();
    if (!tex) throw new Error("Failed to create source texture");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 2);
    // Integer (non-filterable) texture; we only sample it 1:1 in the ingest pass.
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGB16UI,
      image.width,
      image.height,
      0,
      gl.RGB_INTEGER,
      gl.UNSIGNED_SHORT,
      image.rgb,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.sourceTex = tex;
  }

  renderPreview(params: EditParams): void {
    if (!this.image) return;
    const { width, height } = this.previewSize();
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.runPasses(params, width, height, null, true);
  }

  renderForExport(params: EditParams): ExportResult {
    if (!this.image) throw new Error("No image loaded");
    const gl = this.gl;
    const { width, height } = this.image;

    const exportTex = gl.createTexture();
    const exportFbo = gl.createFramebuffer();
    if (!exportTex || !exportFbo) throw new Error("Failed to create export target");
    gl.bindTexture(gl.TEXTURE_2D, exportTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, exportFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, exportTex, 0);

    this.runPasses(params, width, height, exportFbo, false);

    const pixels = new Uint8ClampedArray(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(exportFbo);
    gl.deleteTexture(exportTex);

    return { width, height, pixels };
  }

  private runPasses(
    params: EditParams,
    width: number,
    height: number,
    targetFbo: WebGLFramebuffer | null,
    flipY: boolean,
  ): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);

    // --- Ingest pass: integer source -> linear float texture at target size.
    this.ensureLinearTarget(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.linearFbo);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.ingestProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    gl.uniform1i(gl.getUniformLocation(this.ingestProgram, "uSource"), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // --- Develop pass: linear float -> target framebuffer.
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
    gl.viewport(0, 0, width, height);
    const prog = this.developProgram;
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.linearTex);
    gl.uniform1i(gl.getUniformLocation(prog, "uImage"), 0);

    const u = toDevelopUniforms(params);
    gl.uniform1f(gl.getUniformLocation(prog, "uExposure"), u.exposure);
    gl.uniform1f(gl.getUniformLocation(prog, "uContrast"), u.contrast);
    gl.uniform3f(gl.getUniformLocation(prog, "uWbGain"), u.wbGain[0], u.wbGain[1], u.wbGain[2]);
    gl.uniform1f(gl.getUniformLocation(prog, "uSaturation"), u.saturation);
    gl.uniform1f(gl.getUniformLocation(prog, "uVibrance"), u.vibrance);
    gl.uniform1f(gl.getUniformLocation(prog, "uAspect"), width / height);
    // Lens mode: 0 = off, 1 = manual Brown model, 2 = embedded in-camera spline.
    let lensMode = 0;
    if (params.lens.enabled) {
      lensMode = this.embedded && params.lens.useEmbedded ? 2 : 1;
    }
    gl.uniform1i(gl.getUniformLocation(prog, "uLensMode"), lensMode);
    gl.uniform1f(gl.getUniformLocation(prog, "uK1"), u.k1);
    gl.uniform1f(gl.getUniformLocation(prog, "uK2"), u.k2);
    gl.uniform1f(gl.getUniformLocation(prog, "uVignette"), u.vignette);
    if (this.embedded) {
      gl.uniform1i(gl.getUniformLocation(prog, "uNc"), this.embedded.nc);
      gl.uniform1fv(gl.getUniformLocation(prog, "uDistFactor"), this.embedded.distFactor);
      gl.uniform1fv(gl.getUniformLocation(prog, "uCaRFactor"), this.embedded.caRFactor);
      gl.uniform1fv(gl.getUniformLocation(prog, "uCaBFactor"), this.embedded.caBFactor);
      gl.uniform1fv(gl.getUniformLocation(prog, "uVigGain"), this.embedded.vigGain);
      gl.uniform1f(gl.getUniformLocation(prog, "uDistScale"), this.embedded.scale);
    } else {
      gl.uniform1i(gl.getUniformLocation(prog, "uNc"), 2);
    }
    gl.uniform1i(gl.getUniformLocation(prog, "uFlipY"), flipY ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindVertexArray(null);
  }

  private ensureLinearTarget(width: number, height: number): void {
    const gl = this.gl;
    if (this.linearTex && this.linearSize.w === width && this.linearSize.h === height) return;

    if (this.linearTex) gl.deleteTexture(this.linearTex);
    if (this.linearFbo) gl.deleteFramebuffer(this.linearFbo);

    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) throw new Error("Failed to create linear target");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.linearTex = tex;
    this.linearFbo = fbo;
    this.linearSize = { w: width, h: height };
  }

  private previewSize(): { width: number; height: number } {
    const img = this.image!;
    const long = Math.max(img.width, img.height);
    if (long <= MAX_PREVIEW_LONG_EDGE) return { width: img.width, height: img.height };
    const scale = MAX_PREVIEW_LONG_EDGE / long;
    return {
      width: Math.max(1, Math.round(img.width * scale)),
      height: Math.max(1, Math.round(img.height * scale)),
    };
  }

  private disposeSource(): void {
    if (this.sourceTex) {
      this.gl.deleteTexture(this.sourceTex);
      this.sourceTex = null;
    }
  }

  dispose(): void {
    const gl = this.gl;
    this.disposeSource();
    if (this.linearTex) gl.deleteTexture(this.linearTex);
    if (this.linearFbo) gl.deleteFramebuffer(this.linearFbo);
    gl.deleteProgram(this.ingestProgram);
    gl.deleteProgram(this.developProgram);
    gl.deleteVertexArray(this.vao);
    this.linearTex = null;
    this.linearFbo = null;
  }
}
