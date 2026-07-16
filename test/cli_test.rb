# frozen_string_literal: true

require_relative "test_helper"
require_relative "../lib/rubylens/cli"

class CLITest < Minitest::Test
  def test_report_defaults_to_current_directory_and_prints_machine_readable_result
    result = RubyLens::Result.new(
      output_path: "/tmp/report.html",
      counts: { "namespaces" => 12 },
      warnings: ["partial dependency index"],
    )
    RubyLens.expects(:generate_report)
      .with(path: Dir.pwd, output: nil, lockfile: nil)
      .returns(result)

    status, output, errors = run_cli(["report"])

    assert_equal(0, status)
    assert_equal("/tmp/report.html", JSON.parse(output).fetch("output"))
    assert_includes(errors, "private codebase structure")
  end

  def test_version
    status, output, = run_cli(["--version"])

    assert_equal(0, status)
    assert_equal("#{RubyLens::VERSION}\n", output)
  end

  def test_showcase_defaults_to_current_directory_and_prints_machine_readable_result
    result = RubyLens::Result.new(
      output_path: "/tmp/showcase.html",
      counts: { "namespaces" => 24 },
      warnings: [],
    )
    RubyLens.expects(:generate_showcase)
      .with(path: Dir.pwd, output: nil, lockfile: nil, details: false)
      .returns(result)

    status, output, errors = run_cli(["showcase"])

    assert_equal(0, status)
    assert_equal("/tmp/showcase.html", JSON.parse(output).fetch("output"))
    assert_includes(errors, "--details also includes")
  end

  def test_showcase_details_is_an_explicit_single_opt_in
    result = RubyLens::Result.new(output_path: "/tmp/showcase.html", counts: {}, warnings: [])
    RubyLens.expects(:generate_showcase)
      .with(path: "project", output: nil, lockfile: nil, details: true)
      .returns(result)

    status, _output, errors = run_cli(["showcase", "--details", "project"])

    assert_equal(0, status)
    assert_includes(errors, "selected Ruby and dependency names")
  end

  def test_options_work_without_a_target
    cases = {
      generate_report: ["report", "--output", "/tmp/report.html", "--lockfile", "/tmp/report.lock"],
      generate_showcase: ["showcase", "--lockfile", "/tmp/showcase.lock", "--output", "/tmp/showcase.html"],
    }

    cases.each do |method, arguments|
      command = arguments.first
      expected = { path: Dir.pwd, output: "/tmp/#{command}.html", lockfile: "/tmp/#{command}.lock" }
      expected[:details] = false if command == "showcase"
      result = RubyLens::Result.new(output_path: expected.fetch(:output), counts: {}, warnings: [])
      RubyLens.expects(method).with(**expected).returns(result)

      status, output, = run_cli(arguments)

      assert_equal(0, status, command)
      assert_equal(expected.fetch(:output), JSON.parse(output).fetch("output"), command)
    end
  end

  def test_explicit_target_works_with_options_in_either_order
    cases = {
      generate_report: ["report", "--output", "/tmp/report.html", "project", "--lockfile", "/tmp/report.lock"],
      generate_showcase: ["showcase", "project", "--lockfile", "/tmp/showcase.lock", "--output", "/tmp/showcase.html"],
    }

    cases.each do |method, arguments|
      command = arguments.first
      expected = { path: "project", output: "/tmp/#{command}.html", lockfile: "/tmp/#{command}.lock" }
      expected[:details] = false if command == "showcase"
      result = RubyLens::Result.new(output_path: expected.fetch(:output), counts: {}, warnings: [])
      RubyLens.expects(method).with(**expected).returns(result)

      status, output, = run_cli(arguments)

      assert_equal(0, status, command)
      assert_equal(expected.fetch(:output), JSON.parse(output).fetch("output"), command)
    end
  end

  def test_extra_target_is_rejected_before_generation
    RubyLens.expects(:generate_report).never
    RubyLens.expects(:generate_showcase).never

    %w[report showcase].each do |command|
      status, _output, errors = run_cli([command, "first", "second"])

      assert_equal(2, status, command)
      assert_includes(errors, "unexpected argument: second", command)
    end
  end

  def test_subcommand_help_does_not_generate
    RubyLens.expects(:generate_report).never
    RubyLens.expects(:generate_showcase).never

    [["report", "--help"], ["showcase", "-h"]].each do |command, help_flag|
      status, output, errors = run_cli([command, help_flag])

      assert_equal(0, status, command)
      assert_includes(output, "Usage: rubylens #{command} [OPTIONS] [TARGET]", command)
      assert_includes(output, "TARGET defaults to the current working directory", command)
      assert_includes(output, "--output FILE", command)
      assert_includes(output, "--lockfile FILE", command)
      if command == "showcase"
        assert_includes(output, "--details", command)
      else
        refute_includes(output, "--details", command)
      end
      assert_empty(errors, command)
    end
  end

  def test_help_lists_only_the_supported_product_commands
    status, output, = run_cli(["help"])

    assert_equal(0, status)
    assert_includes(output, "TARGET defaults to the current working directory")
    assert_includes(output, "rubylens report --help")
    assert_includes(output, "rubylens showcase --help")
    assert_includes(output, "report [OPTIONS] [TARGET]")
    assert_includes(output, "showcase [OPTIONS] [TARGET]")
  end

  def test_unknown_commands_are_rejected_with_help
    status, _output, errors = run_cli(["cosmos"])

    assert_equal(2, status)
    assert_includes(errors, "Unknown command: cosmos")
    assert_includes(errors, "report [OPTIONS] [TARGET]")
  end

  private

  def run_cli(arguments)
    status = nil
    output, errors = capture_io { status = RubyLens::CLI.new.run(arguments) }
    [status, output, errors]
  end
end
