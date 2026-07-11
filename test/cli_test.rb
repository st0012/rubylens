# frozen_string_literal: true

require_relative "test_helper"

class CLITest < Minitest::Test
  def test_build_prints_machine_readable_result_and_privacy_warning
    output = StringIO.new
    errors = StringIO.new
    result = RubyLens::Result.new(
      output_path: "/tmp/report.html",
      counts: { "namespaces" => 12 },
      warnings: ["partial dependency index"],
    )
    generator = ->(**_arguments) { result }

    status = RubyLens::CLI.new(stdout: output, stderr: errors, generator: generator)
      .run(["build", ".", "--output", "/tmp/report.html"])

    assert_equal(0, status)
    assert_equal("/tmp/report.html", JSON.parse(output.string).fetch("output"))
    assert_includes(errors.string, "private codebase structure")
  end

  def test_version
    output = StringIO.new

    status = RubyLens::CLI.new(stdout: output, stderr: StringIO.new).run(["--version"])

    assert_equal(0, status)
    assert_equal("#{RubyLens::VERSION}\n", output.string)
  end

  def test_gif_prints_machine_readable_result_and_forwards_capture_options
    output = StringIO.new
    errors = StringIO.new
    received = nil
    gif_generator = lambda do |**options, &progress|
      received = options
      progress.call(:capture, 1, 1)
      progress.call(:encode, 2, 2)
      RubyLens::Result.new(
        output_path: "/tmp/galaxy.gif",
        counts: { "namespaces" => 24 },
        warnings: [],
      )
    end

    status = RubyLens::CLI.new(stdout: output, stderr: errors, gif_generator: gif_generator).run(
      ["gif", ".", "--output", "/tmp/galaxy.gif", "--duration", "10", "--fps", "8", "--size", "640x360", "--browser", "/tmp/chrome", "--ffmpeg", "/tmp/ffmpeg"],
    )

    assert_equal(0, status)
    assert_equal(
      {
        path: ".",
        output: "/tmp/galaxy.gif",
        duration: 10.0,
        fps: 8,
        width: 640,
        height: 360,
        browser_path: "/tmp/chrome",
        ffmpeg_path: "/tmp/ffmpeg",
      },
      received,
    )
    assert_equal("/tmp/galaxy.gif", JSON.parse(output.string).fetch("output"))
    assert_includes(errors.string, "Capturing galaxy frames")
    assert_includes(errors.string, "Encoding GIF")
    assert_includes(errors.string, "Share them intentionally")
  end

  def test_gif_rejects_an_invalid_size
    errors = StringIO.new

    status = RubyLens::CLI.new(stdout: StringIO.new, stderr: errors).run(["gif", ".", "--size", "wide"])

    assert_equal(2, status)
    assert_includes(errors.string, "size must use WIDTHxHEIGHT")
  end
end
