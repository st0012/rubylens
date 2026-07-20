# frozen_string_literal: true

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
    MARKER_SCAN_HEAD_BYTES = 512 * 1024
    MARKER_SCAN_TAIL_BYTES = 64 * 1024

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

    def rubylens_clip?(path)
      return false unless File.file?(path)

      File.open(path, "rb") do |file|
        return true if file.read(MARKER_SCAN_HEAD_BYTES).to_s.include?(Clip::Renderer::MARKER_COMMENT)
        return false unless file.size > MARKER_SCAN_HEAD_BYTES

        file.seek([file.size - MARKER_SCAN_TAIL_BYTES, MARKER_SCAN_HEAD_BYTES].max)
        file.read.to_s.include?(Clip::Renderer::MARKER_COMMENT)
      end
    rescue Errno::ENOENT, Errno::EACCES
      false
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
    # With --output FILE.mp4, the showcase HTML lands next to it and both are
    # written exactly where requested, like other custom output paths.
    def resolve_outputs(root)
      if @output.nil?
        default = DefaultOutput.resolve(root: root, name: DEFAULT_CLIP_NAME, description: "clip") do |existing|
          rubylens_clip?(existing)
        end
        return [default, nil]
      end

      [@output, showcase_companion_path(@output)]
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
