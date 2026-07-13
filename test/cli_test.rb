# frozen_string_literal: true

require_relative "test_helper"

class CLITest < Minitest::Test
  def test_report_defaults_to_current_directory_and_prints_machine_readable_result
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
      .run(["report"])

    assert_equal(0, status)
    assert_equal({ path: Dir.pwd, output: nil, lockfile: nil }, received)
    assert_equal("/tmp/report.html", JSON.parse(output.string).fetch("output"))
    assert_includes(errors.string, "private codebase structure")
  end

  def test_version
    output = StringIO.new

    status = RubyLens::CLI.new(stdout: output, stderr: StringIO.new).run(["--version"])

    assert_equal(0, status)
    assert_equal("#{RubyLens::VERSION}\n", output.string)
  end

  def test_showcase_defaults_to_current_directory_and_prints_machine_readable_result
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
      .run(["showcase"])

    assert_equal(0, status)
    assert_equal({ path: Dir.pwd, output: nil, lockfile: nil, details: false }, received)
    assert_equal("/tmp/showcase.html", JSON.parse(output.string).fetch("output"))
    assert_includes(errors.string, "--details also includes")
  end

  def test_showcase_details_is_an_explicit_single_opt_in
    output = StringIO.new
    errors = StringIO.new
    received = nil
    showcase_generator = lambda do |**options|
      received = options
      RubyLens::Result.new(output_path: "/tmp/showcase.html", counts: {}, warnings: [])
    end

    status = RubyLens::CLI.new(stdout: output, stderr: errors, showcase_generator: showcase_generator)
      .run(["showcase", "--details", "project"])

    assert_equal(0, status)
    assert_equal({ path: "project", output: nil, lockfile: nil, details: true }, received)
    assert_includes(errors.string, "selected Ruby and dependency names")
  end

  def test_options_work_without_a_target
    cases = {
      "report" => ["--output", "/tmp/report.html", "--lockfile", "/tmp/report.lock"],
      "showcase" => ["--lockfile", "/tmp/showcase.lock", "--output", "/tmp/showcase.html"],
    }

    cases.each do |command, arguments|
      received = nil
      generator = lambda do |**options|
        received = options
        RubyLens::Result.new(output_path: options[:output], counts: {}, warnings: [])
      end
      cli = RubyLens::CLI.new(
        stdout: StringIO.new,
        stderr: StringIO.new,
        report_generator: generator,
        showcase_generator: generator,
      )

      status = cli.run([command, *arguments])

      assert_equal(0, status, command)
      assert_equal(Dir.pwd, received[:path], command)
      assert_equal("/tmp/#{command}.html", received[:output], command)
      assert_equal("/tmp/#{command}.lock", received[:lockfile], command)
    end
  end

  def test_explicit_target_works_with_options_in_either_order
    cases = {
      "report" => ["--output", "/tmp/report.html", "project", "--lockfile", "/tmp/report.lock"],
      "showcase" => ["project", "--lockfile", "/tmp/showcase.lock", "--output", "/tmp/showcase.html"],
    }

    cases.each do |command, arguments|
      received = nil
      generator = lambda do |**options|
        received = options
        RubyLens::Result.new(output_path: options[:output], counts: {}, warnings: [])
      end
      cli = RubyLens::CLI.new(
        stdout: StringIO.new,
        stderr: StringIO.new,
        report_generator: generator,
        showcase_generator: generator,
      )

      status = cli.run([command, *arguments])

      assert_equal(0, status, command)
      expected = { path: "project", output: "/tmp/#{command}.html", lockfile: "/tmp/#{command}.lock" }
      expected[:details] = false if command == "showcase"
      assert_equal(expected, received, command)
    end
  end

  def test_extra_target_is_rejected_before_generation
    generator = ->(**) { flunk("generator should not be called") }

    %w[report showcase].each do |command|
      errors = StringIO.new
      cli = RubyLens::CLI.new(
        stdout: StringIO.new,
        stderr: errors,
        report_generator: generator,
        showcase_generator: generator,
      )

      status = cli.run([command, "first", "second"])

      assert_equal(2, status, command)
      assert_includes(errors.string, "unexpected argument: second", command)
    end
  end

  def test_subcommand_help_uses_cli_output_without_generating
    generator = ->(**) { flunk("generator should not be called") }

    [["report", "--help"], ["showcase", "-h"]].each do |command, help_flag|
      output = StringIO.new
      errors = StringIO.new
      cli = RubyLens::CLI.new(
        stdout: output,
        stderr: errors,
        report_generator: generator,
        showcase_generator: generator,
      )

      status = cli.run([command, help_flag])

      assert_equal(0, status, command)
      assert_includes(output.string, "Usage: rubylens #{command} [OPTIONS] [TARGET]", command)
      assert_includes(output.string, "TARGET defaults to the current working directory", command)
      assert_includes(output.string, "--output FILE", command)
      assert_includes(output.string, "--lockfile FILE", command)
      if command == "showcase"
        assert_includes(output.string, "--details", command)
      else
        refute_includes(output.string, "--details", command)
      end
      assert_empty(errors.string, command)
    end
  end

  def test_help_lists_only_the_supported_product_commands
    output = StringIO.new

    status = RubyLens::CLI.new(stdout: output, stderr: StringIO.new).run(["help"])

    assert_equal(0, status)
    assert_includes(output.string, "TARGET defaults to the current working directory")
    assert_includes(output.string, "rubylens report --help")
    assert_includes(output.string, "rubylens showcase --help")
    assert_includes(output.string, "report [OPTIONS] [TARGET]")
    assert_includes(output.string, "showcase [OPTIONS] [TARGET]")
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
end
