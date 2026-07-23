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

  def test_clip_defaults_print_both_artifacts_and_wire_progress_reporting
    result = RubyLens::ClipResult.new(
      output_path: "/tmp/clip.mp4",
      showcase_path: "/tmp/showcase.html",
      counts: { "namespaces" => 3 },
      warnings: [],
    )
    captured = nil
    RubyLens.expects(:generate_clip).with do |**options|
      captured = options
      options[:path] == Dir.pwd && options[:output].nil? && options[:lockfile].nil? &&
        options[:details] == false && options[:progress].respond_to?(:call)
    end.returns(result)

    status, output, errors = run_cli(["clip"])

    assert_equal(0, status)
    payload = JSON.parse(output)
    assert_equal("/tmp/clip.mp4", payload.fetch("output"))
    assert_equal("/tmp/showcase.html", payload.fetch("showcase"))
    assert_includes(errors, "same picture as showcases")

    _output, progress_lines = capture_io do
      progress = captured.fetch(:progress)
      progress.call(1, 1800)
      progress.call(2, 1800)
      progress.call(900, 1800)
      progress.call(1800, 1800)
    end
    milestones = progress_lines.lines
    assert_equal(3, milestones.length)
    assert_includes(milestones.first, "0% (1/1800 frames)")
    assert_includes(milestones.last, "100% (1800/1800 frames)")
  end

  def test_clip_details_is_an_explicit_single_opt_in
    result = RubyLens::ClipResult.new(output_path: "/tmp/clip.mp4", showcase_path: "/tmp/x.html", counts: {}, warnings: [])
    RubyLens.expects(:generate_clip).with do |**options|
      options[:path] == "project" && options[:details] == true
    end.returns(result)

    status, _output, errors = run_cli(["clip", "--details", "project"])

    assert_equal(0, status)
    assert_includes(errors, "selected Ruby and dependency names")
  end

  def test_collection_requires_multiple_targets_and_prints_project_results
    result = RubyLens::CollectionResult.new(
      output_path: "/tmp/collection.html",
      projects: [
        RubyLens::CollectionProjectResult.new(name: "First", counts: { "namespaces" => 2 }, warnings: []),
        RubyLens::CollectionProjectResult.new(name: "Second", counts: { "namespaces" => 3 }, warnings: ["partial"]),
      ],
    )
    generator = mock("collection generator")
    RubyLens::CollectionGenerator.expects(:new)
      .with(paths: %w[first second], output: "/tmp/collection.html", lockfile: nil)
      .returns(generator)
    generator.expects(:call).returns(result)

    status, output, errors = run_cli(["collection", "first", "second", "--output", "/tmp/collection.html"])
    payload = JSON.parse(output)

    assert_equal(0, status)
    assert_equal("/tmp/collection.html", payload.fetch("output"))
    assert_equal(%w[First Second], payload.fetch("projects").map { |project| project.fetch("name") })
    assert_includes(errors, "every included project")
  end

  def test_collection_shared_lockfile_and_help
    result = RubyLens::CollectionResult.new(output_path: "/tmp/collection.html", projects: [])
    generator = mock("collection generator")
    RubyLens::CollectionGenerator.expects(:new)
      .with(paths: %w[first second], output: nil, lockfile: "/tmp/Gemfile.lock")
      .returns(generator)
    generator.expects(:call).returns(result)

    status, = run_cli(["collection", "--lockfile", "/tmp/Gemfile.lock", "first", "second"])
    assert_equal(0, status)

    RubyLens::CollectionGenerator.expects(:new).never
    status, output, errors = run_cli(["collection", "--help"])
    assert_equal(0, status)
    assert_includes(output, "Usage: rubylens collection [OPTIONS] TARGET TARGET...")
    assert_includes(output, "shows all galaxies in one Explorer")
    assert_empty(errors)
  end

  def test_collection_rejects_fewer_than_two_targets_before_generation
    RubyLens::CollectionGenerator.expects(:new).never

    [[], ["first"]].each do |targets|
      status, _output, errors = run_cli(["collection", *targets])

      assert_equal(2, status)
      assert_includes(errors, "collection requires at least two targets")
    end
  end

  def test_clip_help_documents_the_mp4_output_without_generating
    RubyLens.expects(:generate_clip).never

    status, output, = run_cli(["clip", "--help"])

    assert_equal(0, status)
    assert_includes(output, "Usage: rubylens clip [OPTIONS] [TARGET]")
    assert_includes(output, "Output MP4 (default: TARGET/rubylens-clip.mp4)")
    assert_includes(output, "--details")
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
    assert_includes(output, "rubylens clip --help")
    assert_includes(output, "rubylens showcase --help")
    assert_includes(output, "report [OPTIONS] [TARGET]")
    assert_includes(output, "collection [OPTIONS] TARGET...")
    assert_includes(output, "clip [OPTIONS] [TARGET]")
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
    output, errors = capture_io { status = RubyLens::CLI.new(arguments).run }
    [status, output, errors]
  end
end
