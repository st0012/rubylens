# frozen_string_literal: true

require "tmpdir"

module RubyLens
  class GifGenerator
    DEFAULT_GIF_NAME = "rubylens-galaxy.gif"

    def initialize(generator: Generator.new, writer: GifWriter.new)
      @generator = generator
      @writer = writer
    end

    def call(
      path: Dir.pwd,
      output: nil,
      lockfile: nil,
      duration: GifWriter::DEFAULT_DURATION,
      fps: GifWriter::DEFAULT_FPS,
      width: GifWriter::DEFAULT_WIDTH,
      height: GifWriter::DEFAULT_HEIGHT,
      browser_path: nil,
      ffmpeg_path: nil
    )
      root = File.realpath(path)
      default_output = output.nil?
      if default_output
        output = File.join(root, DEFAULT_GIF_NAME)
        if File.exist?(output) && !@writer.rubylens_gif?(output)
          raise Error, "default GIF path already exists and is not a RubyLens export"
        end
      end

      prepared = @writer.preflight(duration:, fps:, width:, height:, browser_path:, ffmpeg_path:)
      if default_output
        GitRepository.new(root).exclude_local(output, description: "GIF")
      end

      Dir.mktmpdir("rubylens-capture-") do |directory|
        File.chmod(0o700, directory)
        report = @generator.call(path: root, output: File.join(directory, "report.html"), lockfile: lockfile)
        output_path = @writer.write(
          report: report.output_path,
          output: output,
          duration: duration,
          fps: fps,
          width: width,
          height: height,
          browser_path: browser_path,
          ffmpeg_path: ffmpeg_path,
          prepared: prepared,
        ) { |stage, current, total| yield(stage, current, total) if block_given? }
        return Result.new(output_path:, counts: report.counts, warnings: report.warnings)
      end
    rescue Errno::ENOENT, Errno::EACCES, Errno::ELOOP => error
      raise Error, error.message
    end
  end
end
