# frozen_string_literal: true

require "ferrum"
require "fileutils"
require "open3"
require "securerandom"
require "tmpdir"
require "uri"

module RubyLens
  class GifWriter
    MARKER = "RubyLens cinematic galaxy export".b.freeze
    DEFAULT_DURATION = 20.0
    DEFAULT_FPS = 12
    DEFAULT_WIDTH = 960
    DEFAULT_HEIGHT = 540
    MIN_WIDTH = 480
    MIN_HEIGHT = 270
    MAX_PIXEL_FRAMES = 500_000_000

    def initialize(browser_factory: nil, command_runner: nil, browser_detector: nil)
      @browser_factory = browser_factory || method(:build_browser)
      @command_runner = command_runner || method(:run_command)
      @browser_detector = browser_detector || method(:detect_browser)
    end

    def preflight(
      duration: DEFAULT_DURATION,
      fps: DEFAULT_FPS,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      browser_path: nil,
      ffmpeg_path: nil
    )
      duration, fps, width, height = validate_options(duration, fps, width, height)
      frame_count = (duration * fps).round
      if width * height * frame_count > MAX_PIXEL_FRAMES
        raise Error, "GIF capture is too large; reduce its duration, frame rate, or dimensions"
      end

      ffmpeg = executable(ffmpeg_path || "ffmpeg")
      raise Error, "ffmpeg is required to generate GIFs; install it or pass --ffmpeg FILE" unless ffmpeg

      browser = browser_executable(browser_path)
      raise Error, "Chrome or Chromium is required to generate GIFs; install it or pass --browser FILE" unless browser

      {
        duration: duration,
        fps: fps,
        width: width,
        height: height,
        frame_count: frame_count,
        browser_path: browser,
        ffmpeg_path: ffmpeg,
      }.freeze
    end

    def write(
      report:,
      output:,
      duration: DEFAULT_DURATION,
      fps: DEFAULT_FPS,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      browser_path: nil,
      ffmpeg_path: nil,
      prepared: nil
    )
      options = prepared || preflight(duration:, fps:, width:, height:, browser_path:, ffmpeg_path:)

      output = File.expand_path(output)
      FileUtils.mkdir_p(File.dirname(output), mode: 0o700)
      Dir.mktmpdir("rubylens-gif-") do |directory|
        File.chmod(0o700, directory)
        frames = File.join(directory, "frames")
        Dir.mkdir(frames, 0o700)
        capture_frames(
          report,
          frames,
          options.fetch(:frame_count),
          options.fetch(:width),
          options.fetch(:height),
          options.fetch(:browser_path),
        ) { |current| yield(:capture, current, options.fetch(:frame_count)) if block_given? }
        encoded = encode_frames(options.fetch(:ffmpeg_path), frames, directory, options.fetch(:fps)) do |current, total|
          yield(:encode, current, total) if block_given?
        end
        add_marker(encoded)
        publish(encoded, output)
      end
      output
    rescue Ferrum::BinaryNotFoundError
      raise Error, "Chrome or Chromium is required to generate GIFs; install it or pass --browser FILE"
    rescue Ferrum::Error => error
      raise Error, "Chrome capture failed: #{error.message}"
    end

    def rubylens_gif?(path)
      return false unless File.file?(path)

      File.open(path, "rb") do |file|
        return false unless file.read(6)&.match?(/\AGIF8[79]a\z/)

        size = file.size
        file.seek([size - 4096, 0].max)
        file.read.include?(MARKER)
      end
    rescue Errno::ENOENT, Errno::EACCES
      false
    end

    private

    def validate_options(duration, fps, width, height)
      duration = Float(duration)
      fps = Integer(fps)
      width = Integer(width)
      height = Integer(height)
      raise Error, "GIF duration must be between 1 and 60 seconds" unless duration.between?(1, 60)
      raise Error, "GIF frame rate must be between 1 and 30 fps" unless fps.between?(1, 30)
      raise Error, "GIF width must be between #{MIN_WIDTH} and 1920 pixels" unless width.between?(MIN_WIDTH, 1920)
      raise Error, "GIF height must be between #{MIN_HEIGHT} and 1080 pixels" unless height.between?(MIN_HEIGHT, 1080)

      [duration, fps, width, height]
    rescue ArgumentError, TypeError
      raise Error, "invalid GIF capture options"
    end

    def capture_frames(report, directory, frame_count, width, height, browser_path)
      browser = @browser_factory.call(width:, height:, browser_path:)
      browser.set_viewport(width:, height:, scale_factor: 1)
      report_url = URI::Generic.build(scheme: "file", path: File.expand_path(report), query: "capture=1").to_s
      browser.go_to(report_url)
      ready = browser.evaluate("Boolean(window.RubyLensCapture && window.RubyLensCapture.ready)")
      raise Error, "generated report did not enter capture mode" unless ready

      frame_count.times do |index|
        browser.evaluate("window.RubyLensCapture.renderFrame(#{index}, #{frame_count})")
        browser.screenshot(path: File.join(directory, format("frame-%04d.png", index)), full: false)
        yield(index + 1) if block_given?
      end
    ensure
      begin
        browser&.quit
      rescue Ferrum::Error
        nil
      end
    end

    def build_browser(width:, height:, browser_path:)
      options = {
        headless: true,
        incognito: true,
        js_errors: true,
        timeout: 30,
        process_timeout: 30,
        window_size: [width, height],
        browser_options: {
          "disable-background-networking" => nil,
          "disable-component-update" => nil,
          "disable-default-apps" => nil,
          "disable-sync" => nil,
          "hide-scrollbars" => nil,
          "metrics-recording-only" => nil,
          "mute-audio" => nil,
          "no-first-run" => nil,
        },
      }
      options[:browser_path] = File.expand_path(browser_path) if browser_path
      Ferrum::Browser.new(**options)
    end

    def encode_frames(ffmpeg, frames, directory, fps)
      palette = File.join(directory, "palette.png")
      encoded = File.join(directory, "rubylens-galaxy.gif")
      input = File.join(frames, "frame-%04d.png")
      run!(
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-framerate", fps.to_s, "-i", input,
        "-vf", "palettegen=stats_mode=diff:max_colors=192:reserve_transparent=0", palette,
      )
      yield(1, 2) if block_given?
      run!(
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-framerate", fps.to_s, "-i", input, "-i", palette,
        "-lavfi", "paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle", "-loop", "0", encoded,
      )
      yield(2, 2) if block_given?
      encoded
    end

    def run!(*arguments)
      _stdout, stderr, status = @command_runner.call(*arguments)
      return if status.success?

      message = stderr.to_s.strip
      raise Error, message.empty? ? "GIF encoding failed" : "GIF encoding failed: #{message}"
    end

    def run_command(*arguments)
      Open3.capture3(*arguments)
    end

    def executable(command)
      return nil unless command
      return File.expand_path(command) if command.include?(File::SEPARATOR) && File.file?(command) && File.executable?(command)
      return nil if command.include?(File::SEPARATOR)

      ENV.fetch("PATH", "").split(File::PATH_SEPARATOR).each do |directory|
        candidate = File.join(directory, command)
        return candidate if File.file?(candidate) && File.executable?(candidate)
      end
      nil
    end

    def browser_executable(path)
      candidate = path || ENV["BROWSER_PATH"] || @browser_detector.call
      return nil unless candidate

      executable(candidate)
    rescue Ferrum::BinaryNotFoundError, Ferrum::EmptyPathError
      nil
    end

    def detect_browser
      Ferrum::Browser::Options::Chrome.options.detect_path
    end

    def add_marker(path)
      contents = File.binread(path)
      raise Error, "GIF encoder returned an invalid file" unless contents.start_with?("GIF87a", "GIF89a") && contents.end_with?(";")

      blocks = MARKER.bytes.each_slice(255).map { |slice| [slice.length, *slice].pack("C*") }.join
      marked = contents.byteslice(0, contents.bytesize - 1) + "\x21\xFE".b + blocks.b + "\x00;".b
      File.binwrite(path, marked)
    end

    def publish(source, output)
      temporary = File.join(File.dirname(output), ".#{File.basename(output)}.#{SecureRandom.hex(6)}.tmp")
      File.open(temporary, File::WRONLY | File::CREAT | File::EXCL, 0o600) do |target|
        File.open(source, "rb") { |input| IO.copy_stream(input, target) }
      end
      File.chmod(0o600, temporary)
      File.rename(temporary, output)
      File.chmod(0o600, output)
    ensure
      FileUtils.rm_f(temporary) if temporary && File.exist?(temporary)
    end
  end
end
