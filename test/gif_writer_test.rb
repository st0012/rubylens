# frozen_string_literal: true

require_relative "test_helper"

class GifWriterTest < Minitest::Test
  def test_captures_fixed_frames_encodes_marks_and_publishes_privately
    Dir.mktmpdir("rubylens-gif-writer-") do |directory|
      report = File.join(directory, "report.html")
      output = File.join(directory, "galaxy.gif")
      ffmpeg = File.join(directory, "ffmpeg")
      browser_path = File.join(directory, "chrome")
      File.write(report, "private report")
      File.write(ffmpeg, "#!/bin/sh\n")
      File.write(browser_path, "#!/bin/sh\n")
      File.chmod(0o700, ffmpeg)
      File.chmod(0o700, browser_path)
      browser = FakeBrowser.new
      commands = []
      success = Struct.new(:success?).new(true)
      runner = lambda do |*arguments|
        commands << arguments
        destination = arguments.last
        if destination.end_with?("palette.png")
          File.binwrite(destination, "palette")
        else
          File.binwrite(destination, "GIF89a\x01\x00\x01\x00\x00;")
        end
        ["", "", success]
      end
      factory = lambda do |**options|
        browser.options = options
        browser
      end
      progress = []

      writer = RubyLens::GifWriter.new(browser_factory: factory, command_runner: runner)
      result = writer.write(report: report, output: output, duration: 1, fps: 2, width: 480, height: 270, browser_path: browser_path, ffmpeg_path: ffmpeg) do |stage, current, total|
        progress << [stage, current, total]
      end

      assert_equal(output, result)
      assert_equal({ width: 480, height: 270, browser_path: browser_path }, browser.options)
      assert_equal({ width: 480, height: 270, scale_factor: 1 }, browser.viewport)
      assert_match(%r{\Afile:/+}, browser.url)
      assert_includes(browser.url, "capture=1")
      assert_equal(2, browser.screenshots.length)
      assert_includes(browser.evaluations, "window.RubyLensCapture.renderFrame(0, 2)")
      assert_includes(browser.evaluations, "window.RubyLensCapture.renderFrame(1, 2)")
      assert(browser.quit?)
      assert_equal(2, commands.length)
      assert_equal([:capture, 2, 2], progress.fetch(1))
      assert_equal([:encode, 2, 2], progress.last)
      assert(writer.rubylens_gif?(output))
      assert_includes(File.binread(output), RubyLens::GifWriter::MARKER)
      assert_equal(0o600, File.stat(output).mode & 0o777)
    end
  end

  def test_rejects_invalid_capture_options_before_launching_browser
    writer = RubyLens::GifWriter.new(browser_factory: ->(**) { raise "should not launch" })

    error = assert_raises(RubyLens::Error) do
      writer.write(report: "/tmp/report.html", output: "/tmp/report.gif", duration: 0)
    end

    assert_equal("GIF duration must be between 1 and 60 seconds", error.message)
  end

  def test_rejects_a_capture_over_the_pixel_frame_budget
    writer = RubyLens::GifWriter.new(browser_factory: ->(**) { raise "should not launch" })

    error = assert_raises(RubyLens::Error) do
      writer.preflight(duration: 60, fps: 30, width: 1920, height: 1080)
    end

    assert_equal("GIF capture is too large; reduce its duration, frame rate, or dimensions", error.message)
  end

  def test_preflight_honors_the_ferrum_browser_path_environment_variable
    Dir.mktmpdir("rubylens-gif-preflight-") do |directory|
      browser_path = File.join(directory, "chrome")
      ffmpeg_path = File.join(directory, "ffmpeg")
      previous = ENV["BROWSER_PATH"]
      [browser_path, ffmpeg_path].each do |path|
        File.write(path, "#!/bin/sh\n")
        File.chmod(0o700, path)
      end
      ENV["BROWSER_PATH"] = browser_path

      options = RubyLens::GifWriter.new.preflight(duration: 1, fps: 1, width: 480, height: 270, ffmpeg_path: ffmpeg_path)

      assert_equal(browser_path, options.fetch(:browser_path))
    ensure
      ENV["BROWSER_PATH"] = previous
    end
  end

  def test_preflight_reports_a_missing_auto_detected_browser
    Dir.mktmpdir("rubylens-gif-preflight-") do |directory|
      ffmpeg_path = File.join(directory, "ffmpeg")
      previous = ENV.delete("BROWSER_PATH")
      File.write(ffmpeg_path, "#!/bin/sh\n")
      File.chmod(0o700, ffmpeg_path)

      error = assert_raises(RubyLens::Error) do
        RubyLens::GifWriter.new(browser_detector: -> { nil })
          .preflight(duration: 1, fps: 1, width: 480, height: 270, ffmpeg_path: ffmpeg_path)
      end

      assert_equal("Chrome or Chromium is required to generate GIFs; install it or pass --browser FILE", error.message)
    ensure
      ENV["BROWSER_PATH"] = previous
    end
  end

  class FakeBrowser
    attr_accessor :options
    attr_reader :url, :evaluations, :screenshots, :viewport

    def initialize
      @evaluations = []
      @screenshots = []
      @quit = false
    end

    def go_to(url)
      @url = url
    end

    def set_viewport(**options)
      @viewport = options
    end

    def evaluate(expression)
      @evaluations << expression
      expression.start_with?("Boolean(") ? true : {}
    end

    def screenshot(path:, full:)
      raise "expected viewport capture" if full

      @screenshots << path
      File.binwrite(path, "PNG")
    end

    def quit
      @quit = true
    end

    def quit?
      @quit
    end
  end
end
