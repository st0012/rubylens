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
end
