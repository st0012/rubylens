# frozen_string_literal: true

require "json"
require "optparse"
require_relative "../rubylens"

module RubyLens
  class CLI
    def initialize(arguments)
      @arguments = arguments.dup
    end

    def run
      arguments = @arguments.dup
      command = arguments.shift
      return print_version if %w[-v --version version].include?(command)
      return print_help(0) if command.nil? || %w[-h --help help].include?(command)
      return generate_report(arguments) if command == "report"
      return generate_showcase(arguments) if command == "showcase"

      $stderr.puts "Unknown command: #{command}"
      print_help(2)
    rescue OptionParser::ParseError, Error, Errno::ENOENT => error
      $stderr.puts "rubylens: #{error.message}"
      2
    end

    private

    def generate_report(arguments)
      generate_html(
        arguments,
        command: "report",
        default_name: "rubylens-report.html",
        generator: RubyLens.method(:generate_report),
        warning: "RubyLens reports contain private codebase structure. Keep the output local unless you intend to share it.",
      )
    end

    def generate_showcase(arguments)
      generate_html(
        arguments,
        command: "showcase",
        default_name: "rubylens-showcase.html",
        generator: RubyLens.method(:generate_showcase),
        warning: "RubyLens showcases disclose the project name and visual codebase structure; --details also includes aggregate statistics and selected Ruby and dependency names. Share them intentionally.",
        details_option: true,
      )
    end

    def generate_html(arguments, command:, default_name:, generator:, warning:, details_option: false)
      options = {}
      help = false
      parser = OptionParser.new do |option|
        option.banner = "Usage: rubylens #{command} [OPTIONS] [TARGET]"
        option.separator ""
        option.separator "TARGET defaults to the current working directory."
        option.separator ""
        option.on("-o", "--output FILE", "Output HTML (default: TARGET/#{default_name})") do |value|
          options[:output] = value
        end
        option.on("--lockfile FILE", "Gemfile.lock used to select exact dependency versions") do |value|
          options[:lockfile] = value
        end
        if details_option
          option.on("--details", "Include aggregate statistics and cinematic code/dependency labels") do
            options[:details] = true
          end
        end
        option.on_tail("-h", "--help", "Show this help") do
          help = true
        end
      end
      parser.parse!(arguments)
      if help
        $stdout.puts parser
        return 0
      end

      target = arguments.shift || Dir.pwd
      raise OptionParser::InvalidArgument, "unexpected argument: #{arguments.first}" unless arguments.empty?

      generator_options = { path: target, output: options[:output], lockfile: options[:lockfile] }
      generator_options[:details] = options.fetch(:details, false) if details_option
      result = generator.call(**generator_options)
      print_result(result)
      $stderr.puts warning
      0
    end

    def print_result(result)
      $stdout.puts JSON.generate(
        output: result.output_path,
        counts: result.counts,
        warnings: result.warnings,
      )
    end

    def print_version
      $stdout.puts RubyLens::VERSION
      0
    end

    def print_help(status)
      stream = status.zero? ? $stdout : $stderr
      stream.puts <<~HELP
        Usage: rubylens COMMAND

        TARGET defaults to the current working directory.

        Commands:
          report [OPTIONS] [TARGET]     Generate a private, interactive stellar report
          showcase [OPTIONS] [TARGET]   Generate an autonomous, shareable stellar showcase
          version                       Print the RubyLens version

        Run `rubylens report --help` or `rubylens showcase --help` for options.
      HELP
      status
    end
  end
end
