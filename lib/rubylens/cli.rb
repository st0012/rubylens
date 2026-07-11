# frozen_string_literal: true

require "json"
require "optparse"

module RubyLens
  class CLI
    def initialize(
      stdout: $stdout,
      stderr: $stderr,
      report_generator: RubyLens.method(:generate_report),
      showcase_generator: RubyLens.method(:generate_showcase)
    )
      @stdout = stdout
      @stderr = stderr
      @report_generator = report_generator
      @showcase_generator = showcase_generator
    end

    def run(arguments)
      arguments = arguments.dup
      command = arguments.shift
      return print_version if %w[-v --version version].include?(command)
      return print_help(0) if command.nil? || %w[-h --help help].include?(command)
      return generate_report(arguments) if command == "report"
      return generate_showcase(arguments) if command == "showcase"

      @stderr.puts "Unknown command: #{command}"
      print_help(2)
    rescue OptionParser::ParseError, Error, Errno::ENOENT => error
      @stderr.puts "rubylens: #{error.message}"
      2
    end

    private

    def generate_report(arguments)
      generate_html(
        arguments,
        command: "report",
        default_name: "rubylens-report.html",
        generator: @report_generator,
        warning: "RubyLens reports contain private codebase structure. Keep the output local unless you intend to share it.",
      )
    end

    def generate_showcase(arguments)
      generate_html(
        arguments,
        command: "showcase",
        default_name: "rubylens-showcase.html",
        generator: @showcase_generator,
        warning: "RubyLens showcases disclose the project name, aggregate statistics, and visual codebase structure. Share them intentionally.",
      )
    end

    def generate_html(arguments, command:, default_name:, generator:, warning:)
      options = {}
      parser = OptionParser.new do |option|
        option.banner = "Usage: rubylens #{command} [TARGET] [--output FILE] [--lockfile FILE]"
        option.on("-o", "--output FILE", "Output HTML (default: TARGET/#{default_name})") do |value|
          options[:output] = value
        end
        option.on("--lockfile FILE", "Gemfile.lock used to select exact dependency versions") do |value|
          options[:lockfile] = value
        end
        configuration_options(option, options)
      end
      parser.parse!(arguments)
      target = arguments.shift || Dir.pwd
      raise OptionParser::InvalidArgument, "unexpected argument: #{arguments.first}" unless arguments.empty?

      result = generator.call(
        path: target, output: options[:output], lockfile: options[:lockfile],
        config: options[:config], no_config: options.fetch(:no_config, false),
      )
      print_result(result)
      @stderr.puts warning
      0
    end

    def print_result(result)
      @stdout.puts JSON.generate(
        output: result.output_path,
        counts: result.counts,
        warnings: result.warnings,
      )
    end

    def configuration_options(parser, options)
      parser.on("--config FILE", "Boundary configuration (default: TARGET/.rubylens.yml)") { |value| options[:config] = value }
      parser.on("--no-config", "Ignore boundary configuration") { options[:no_config] = true }
    end

    def print_version
      @stdout.puts RubyLens::VERSION
      0
    end

    def print_help(status)
      stream = status.zero? ? @stdout : @stderr
      stream.puts <<~HELP
        Usage: rubylens COMMAND

        Commands:
          report [TARGET]     Generate a private, interactive stellar report
          showcase [TARGET]   Generate an autonomous, shareable stellar showcase
          version             Print the RubyLens version
      HELP
      status
    end
  end
end
