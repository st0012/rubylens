# frozen_string_literal: true

require "open3"
require "uri"
require_relative "../errors"
require_relative "chrome_page"

module RubyLens
  module Clip
    # Renders a showcase HTML file into an H.264 MP4: headless Chrome steps
    # the showcase's deterministic clip frames, and each captured frame is
    # streamed straight into ffmpeg so no frame images ever touch disk. One
    # render covers exactly one camera loop, so the video loops seamlessly.
    class Renderer
      STAGE_WIDTH = 1920
      STAGE_HEIGHT = 1080
      DEFAULT_FPS = 30
      READY_TIMEOUT_SECONDS = 120
      MARKER_COMMENT = "RubyLens clip"

      def initialize(chrome:, ffmpeg:, fps: DEFAULT_FPS, frame_limit: nil, progress: nil)
        @chrome = chrome
        @ffmpeg = ffmpeg
        @fps = Integer(fps)
        raise Error, "clip fps must be positive" unless @fps.positive?

        @frame_limit = frame_limit
        @progress = progress
      end

      def render(showcase_html:, output:)
        ChromePage.open(executable: @chrome, url: file_url(showcase_html), width: STAGE_WIDTH, height: STAGE_HEIGHT) do |page|
          wait_until_ready(page)
          preset = begin_clip(page)
          frames = frame_count(preset)
          encode(page, frames, output)
        end
        output
      end

      private

      def file_url(path)
        "file://#{URI::DEFAULT_PARSER.escape(File.expand_path(path))}"
      end

      def wait_until_ready(page)
        deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + READY_TIMEOUT_SECONDS
        until page.evaluate("document.documentElement?.dataset.showcaseReady === 'true'")
          raise Error, "the showcase page never finished loading" if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline

          sleep 0.1
        end
      end

      def begin_clip(page)
        preset = page.evaluate("beginShowcaseClip()")
        status = preset.is_a?(Hash) ? preset["status"] : nil
        case status
        when "ok" then preset
        when "renderer-unavailable"
          raise Error, "Chrome could not initialize WebGL2, which clip rendering requires"
        else
          raise Error, "the page is not a RubyLens showcase"
        end
      end

      def frame_count(preset)
        stage = [preset["stageWidth"], preset["stageHeight"]]
        unless stage == [STAGE_WIDTH, STAGE_HEIGHT]
          raise Error, "showcase stage is #{stage.join("x")} but clip capture expects #{STAGE_WIDTH}x#{STAGE_HEIGHT}"
        end

        frames = Integer(preset.fetch("durationMs")) * @fps / 1000
        @frame_limit ? [frames, Integer(@frame_limit)].min : frames
      end

      def ffmpeg_arguments(output)
        [
          @ffmpeg, "-loglevel", "error", "-y",
          "-f", "image2pipe", "-c:v", "png", "-framerate", @fps.to_s, "-i", "-",
          "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
          "-movflags", "+faststart",
          "-metadata", "comment=#{MARKER_COMMENT}",
          "-f", "mp4", output
        ]
      end

      def encode(page, frames, output)
        stdin, stderr, waiter = Open3.popen3(*ffmpeg_arguments(output)).then { |i, o, e, t| o.close; [i, e, t] }
        stdin.binmode
        stderr_reader = Thread.new { stderr.read }
        frames.times do |index|
          page.evaluate("renderShowcaseClipFrame(#{index}, #{@fps})", await: true)
          stdin.write(page.screenshot_png)
          @progress&.call(index + 1, frames)
        end
        stdin.close
        status = waiter.value
        raise Error, "ffmpeg failed while encoding the clip: #{failure_reason(stderr_reader.value)}" unless status.success?
      rescue Errno::EPIPE
        raise Error, "ffmpeg stopped accepting frames: #{failure_reason(stderr_reader.value)}"
      rescue Errno::ENOENT => error
        raise Error, "could not run ffmpeg at #{@ffmpeg}: #{error.message}"
      ensure
        stdin.close if stdin && !stdin.closed?
        stderr.close if stderr && !stderr.closed?
      end

      def failure_reason(stderr_output)
        lines = stderr_output.to_s.strip.lines.last(3).map(&:strip)
        lines.empty? ? "no error output" : lines.join(" / ")
      end
    end
  end
end
