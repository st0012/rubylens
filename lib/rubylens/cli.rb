# frozen_string_literal: true

require "json"
require "optparse"

module RubyLens
  class CLI
    def initialize(stdout: $stdout, stderr: $stderr, generator: RubyLens.method(:generate), gif_generator: RubyLens.method(:generate_gif))
      @stdout = stdout
      @stderr = stderr
      @generator = generator
      @gif_generator = gif_generator
    end

    def run(arguments)
      arguments = arguments.dup
      command = arguments.shift
      return print_version if %w[-v --version version].include?(command)
      return print_help(0) if command.nil? || %w[-h --help help].include?(command)
      return build(arguments) if command == "build"
      return gif(arguments) if command == "gif"

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
        option.on("-o", "--output FILE", "Local report (default: TARGET/rubylens-report.html)") do |value|
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
      print_result(result)
      @stderr.puts "RubyLens reports contain private codebase structure. Keep the output local unless you intend to share it."
      0
    end

    def gif(arguments)
      options = {}
      parser = OptionParser.new do |option|
        option.banner = "Usage: rubylens gif [TARGET] [--output FILE] [--duration SECONDS] [--fps NUMBER] [--size WIDTHxHEIGHT]"
        option.on("-o", "--output FILE", "Animated GIF (default: TARGET/rubylens-galaxy.gif)") { |value| options[:output] = value }
        option.on("--lockfile FILE", "Gemfile.lock used to select exact dependency versions") { |value| options[:lockfile] = value }
        option.on("--duration SECONDS", Float, "Animation duration, 1-60 (default: 20)") { |value| options[:duration] = value }
        option.on("--fps NUMBER", Integer, "Frames per second, 1-30 (default: 12)") { |value| options[:fps] = value }
        option.on("--size WIDTHxHEIGHT", "Frame size, 480x270-1920x1080 (default: 960x540)") do |value|
          match = /\A(\d+)x(\d+)\z/i.match(value)
          raise OptionParser::InvalidArgument, "size must use WIDTHxHEIGHT" unless match

          options[:width] = match[1].to_i
          options[:height] = match[2].to_i
        end
        option.on("--browser FILE", "Chrome or Chromium executable") { |value| options[:browser_path] = value }
        option.on("--ffmpeg FILE", "ffmpeg executable") { |value| options[:ffmpeg_path] = value }
      end
      parser.parse!(arguments)
      target = arguments.shift || Dir.pwd
      raise OptionParser::InvalidArgument, "unexpected argument: #{arguments.first}" unless arguments.empty?

      progress = lambda do |stage, current, total|
        if stage == :capture
          step = [total / 10, 1].max
          @stderr.puts "Capturing galaxy frames: #{current}/#{total}" if current == 1 || current == total || (current % step).zero?
        else
          @stderr.puts "Encoding GIF: #{current}/#{total}"
        end
      end
      result = @gif_generator.call(path: target, **options, &progress)
      print_result(result)
      @stderr.puts "RubyLens GIFs reveal the project name, aggregate statistics, and visual codebase structure. Share them intentionally."
      0
    end

    def print_result(result)
      @stdout.puts JSON.generate(
        output: result.output_path,
        counts: result.counts,
        warnings: result.warnings,
      )
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
          gif [TARGET]     Render a cinematic looping galaxy GIF
          version          Print the RubyLens version
      HELP
      status
    end
  end
end
