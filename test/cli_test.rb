# frozen_string_literal: true

require_relative "test_helper"

class CLITest < Minitest::Test
  def test_report_prints_machine_readable_result_and_privacy_warning
    output = StringIO.new
    errors = StringIO.new
    result = RubyLens::Result.new(
      output_path: "/tmp/report.html",
      counts: { "namespaces" => 12 },
      warnings: ["partial dependency index"],
    )
    received = nil
    report_generator = ->(**arguments) { received = arguments; result }

    status = RubyLens::CLI.new(stdout: output, stderr: errors, report_generator: report_generator)
      .run(["report", ".", "--output", "/tmp/report.html", "--lockfile", "/tmp/Gemfile.lock"])

    assert_equal(0, status)
    assert_equal(
      { path: ".", output: "/tmp/report.html", lockfile: "/tmp/Gemfile.lock", config: nil, no_config: false },
      received,
    )
    assert_equal("/tmp/report.html", JSON.parse(output.string).fetch("output"))
    assert_includes(errors.string, "private codebase structure")
  end

  def test_version
    output = StringIO.new

    status = RubyLens::CLI.new(stdout: output, stderr: StringIO.new).run(["--version"])

    assert_equal(0, status)
    assert_equal("#{RubyLens::VERSION}\n", output.string)
  end

  def test_showcase_prints_machine_readable_result_and_privacy_warning
    output = StringIO.new
    errors = StringIO.new
    received = nil
    showcase_generator = lambda do |**options|
      received = options
      RubyLens::Result.new(
        output_path: "/tmp/showcase.html",
        counts: { "namespaces" => 24 },
        warnings: [],
      )
    end

    status = RubyLens::CLI.new(stdout: output, stderr: errors, showcase_generator: showcase_generator)
      .run(["showcase", ".", "--output", "/tmp/showcase.html", "--lockfile", "/tmp/Gemfile.lock"])

    assert_equal(0, status)
    assert_equal(
      { path: ".", output: "/tmp/showcase.html", lockfile: "/tmp/Gemfile.lock", config: nil, no_config: false },
      received,
    )
    assert_equal("/tmp/showcase.html", JSON.parse(output.string).fetch("output"))
    assert_includes(errors.string, "Share them intentionally")
  end

  def test_help_lists_only_the_supported_product_commands
    output = StringIO.new

    status = RubyLens::CLI.new(stdout: output, stderr: StringIO.new).run(["help"])

    assert_equal(0, status)
    assert_includes(output.string, "report [TARGET]")
    assert_includes(output.string, "showcase [TARGET]")
    refute_includes(output.string, "build [TARGET]")
    refute_includes(output.string, "gif [TARGET]")
  end

  def test_removed_commands_are_unknown
    errors = StringIO.new

    build_status = RubyLens::CLI.new(stdout: StringIO.new, stderr: errors).run(["build"])
    gif_status = RubyLens::CLI.new(stdout: StringIO.new, stderr: errors).run(["gif"])

    assert_equal(2, build_status)
    assert_equal(2, gif_status)
    assert_includes(errors.string, "Unknown command: build")
    assert_includes(errors.string, "Unknown command: gif")
    refute_includes(errors.string, "build [TARGET]")
    refute_includes(errors.string, "gif [TARGET]")
  end

  def test_report_forwards_configuration_options
    received = nil
    report_generator = lambda do |**options|
      received = options
      RubyLens::Result.new(output_path: "/tmp/report.html", counts: {}, warnings: [])
    end

    status = RubyLens::CLI.new(stdout: StringIO.new, stderr: StringIO.new, report_generator: report_generator)
      .run(["report", ".", "--config", "/tmp/boundaries.yml"])

    assert_equal(0, status)
    assert_equal("/tmp/boundaries.yml", received.fetch(:config))
  end
end
