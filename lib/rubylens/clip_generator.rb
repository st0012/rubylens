# frozen_string_literal: true

require_relative "artifact_marker"
require_relative "atomic_output"
require_relative "default_output"
require_relative "showcase_generator"
require_relative "clip/renderer"
require_relative "clip/toolchain"

module RubyLens
  ClipResult = Data.define(:output_path, :showcase_path, :counts, :warnings) do
    def to_payload = { output: output_path, showcase: showcase_path, counts: counts, warnings: warnings }
  end

  # Generates a shareable MP4 of a project's showcase. The showcase HTML is
  # written first (it is the render input and stays useful on its own), then
  # headless Chrome and ffmpeg turn it into one seamless 1080p camera loop.
  # The toolchain is checked before any indexing so a missing browser or
  # ffmpeg fails in under a second with install guidance.
  class ClipGenerator
    DEFAULT_CLIP_NAME = "rubylens-clip.mp4"
    # faststart parks the metadata (and so the marker) right behind ftyp, so
    # every clip RubyLens writes matches within this head window.
    MARKER_SCAN_HEAD_BYTES = 512 * 1024

    def initialize(path: Dir.pwd, output: nil, lockfile: nil, details: false, progress: nil, renderer: nil)
      @path = path
      @output = output
      @lockfile = lockfile
      @details = details
      @progress = progress
      @renderer = renderer
    end

    def call
      renderer = @renderer || build_renderer
      root = File.realpath(@path)
      output, showcase_output = resolve_outputs(root)
      showcase_result = ShowcaseGenerator.new(
        path: @path, output: showcase_output, lockfile: @lockfile, details: @details,
      ).call
      render_atomically(renderer, showcase_result.output_path, output)

      ClipResult.new(
        output_path: output,
        showcase_path: showcase_result.output_path,
        counts: showcase_result.counts,
        warnings: showcase_result.warnings,
      )
    rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP => error
      raise Error, error.message
    end

    private

    def build_renderer
      Clip::Renderer.new(
        chrome: Clip::Toolchain.chrome_path,
        ffmpeg: Clip::Toolchain.ffmpeg_path,
        progress: @progress,
      )
    end

    # With no --output, both artifacts use their default names, Git-excluded
    # locally, and an existing default clip is only replaced if it is ours.
    # With --output FILE.mp4, the MP4 is written exactly where requested, like
    # other custom output paths; the derived FILE.html companion was never
    # named by the user, so an unrelated existing file there is refused.
    def resolve_outputs(root)
      if @output.nil?
        default = DefaultOutput.resolve(root: root, name: DEFAULT_CLIP_NAME, description: "clip") do |existing|
          ArtifactMarker.present?(existing, Clip::Renderer::MARKER_COMMENT, head_bytes: MARKER_SCAN_HEAD_BYTES)
        end
        return [default, nil]
      end

      # Expanded once here so the guard, the writer, and the reported result
      # all refer to the same real paths.
      output = File.expand_path(@output)
      companion = showcase_companion_path(output)
      if File.exist?(companion) && !ArtifactMarker.present?(companion, ShowcaseWriter::MARKER)
        raise Error, "clip companion path #{companion} already exists and is not a RubyLens showcase"
      end

      [output, companion]
    end

    def showcase_companion_path(output)
      base = output.sub(/\.mp4\z/i, "")
      base = output if base.empty?
      "#{base}.html"
    end

    def render_atomically(renderer, showcase_html, output)
      AtomicOutput.replace(output) do |temporary|
        renderer.render(showcase_html: showcase_html, output: temporary)
      rescue Error => error
        raise Error, "#{error.message} (the showcase HTML was still written to #{showcase_html})"
      end
    end
  end
end
