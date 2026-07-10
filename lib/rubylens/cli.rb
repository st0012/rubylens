# frozen_string_literal: true

require "json"
require "optparse"

module RubyLens
  class CLI
    def initialize(stdout: $stdout, stderr: $stderr, generator: RubyLens.method(:generate))
      @stdout = stdout
      @stderr = stderr
      @generator = generator
    end

    def run(arguments)
      arguments = arguments.dup
      command = arguments.shift
      return print_version if %w[-v --version version].include?(command)
      return print_help(0) if command.nil? || %w[-h --help help].include?(command)
      return build(arguments) if command == "build"

      @stderr.puts "Unknown command: #{command}"
      print_help(2)
    rescue OptionParser::ParseError, Error, Errno::ENOENT => error
      @stderr.puts "rubylens: #{error.message}"
      2
    end

    private

    def build(arguments)
      options = {}
      parser = OptionParser.new do |option|
        option.banner = "Usage: rubylens build [TARGET] [--output FILE] [--lockfile FILE]"
        option.on("-o", "--output FILE", "Local report (default: TARGET/.rubylens/report.html)") do |value|
          options[:output] = value
        end
        option.on("--lockfile FILE", "Gemfile.lock used to select exact dependency versions") do |value|
          options[:lockfile] = value
        end
      end
      parser.parse!(arguments)
      target = arguments.shift || Dir.pwd
      raise OptionParser::InvalidArgument, "unexpected argument: #{arguments.first}" unless arguments.empty?

      result = @generator.call(path: target, output: options[:output], lockfile: options[:lockfile])
      @stdout.puts JSON.generate(
        output: result.output_path,
        counts: result.counts,
        warnings: result.warnings,
      )
      @stderr.puts "RubyLens reports contain private codebase structure. Keep the output local unless you intend to share it."
      0
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
          build [TARGET]   Build a private, self-contained stellar report
          version          Print the RubyLens version
      HELP
      status
    end
  end
end
