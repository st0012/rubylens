# frozen_string_literal: true

require "json"
require "optparse"
require_relative "../rubylens"

module RubyLens
  class CLI
    # One entry per generating command: everything that differs between
    # report, showcase, and clip lives here, not in per-command methods.
    COMMANDS = {
      "report" => {
        default_name: Generator::DEFAULT_REPORT_NAME,
        generator: :generate_report,
        warning: "RubyLens reports contain private codebase structure. Keep the output local unless you intend to share it.",
        details_option: false,
        output_kind: "HTML",
        report_progress: false,
      },
      "clip" => {
        default_name: ClipGenerator::DEFAULT_CLIP_NAME,
        generator: :generate_clip,
        warning: "RubyLens clips show the same picture as showcases: the project name plus the galaxy's shape and scale; --details adds aggregate statistics and selected Ruby and dependency names. Share them intentionally.",
        details_option: true,
        output_kind: "MP4",
        report_progress: true,
      },
      "showcase" => {
        default_name: ShowcaseGenerator::DEFAULT_SHOWCASE_NAME,
        generator: :generate_showcase,
        warning: "RubyLens showcases disclose the project name and visual codebase structure; --details also includes aggregate statistics and selected Ruby and dependency names. Share them intentionally.",
        details_option: true,
        output_kind: "HTML",
        report_progress: false,
      },
    }.freeze

    def initialize(arguments)
      @arguments = arguments.dup
    end

    def run
      arguments = @arguments.dup
      command = arguments.shift
      return print_version if %w[-v --version version].include?(command)
      return print_help(0) if command.nil? || %w[-h --help help].include?(command)
      return generate_collection(arguments) if command == "collection"
      return generate(command, arguments) if COMMANDS.key?(command)

      $stderr.puts "Unknown command: #{command}"
      print_help(2)
    rescue OptionParser::ParseError, Error, Errno::ENOENT => error
      $stderr.puts "rubylens: #{error.message}"
      2
    end

    private

    def generate_collection(arguments)
      options = {}
      help = false
      parser = OptionParser.new do |option|
        option.banner = "Usage: rubylens collection [OPTIONS] TARGET TARGET..."
        option.separator ""
        option.separator "The collection keeps every target separate and shows all galaxies in one Explorer."
        option.separator ""
        option.on("-o", "--output FILE", "Output HTML (default: first TARGET/rubylens-collection.html)") do |value|
          options[:output] = value
        end
        option.on("--lockfile FILE", "Gemfile.lock used for every target instead of each target's default") do |value|
          options[:lockfile] = value
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
      raise OptionParser::InvalidArgument, "collection requires at least two targets" if arguments.length < 2

      result = CollectionGenerator.new(
        paths: arguments,
        output: options[:output],
        lockfile: options[:lockfile],
      ).call
      print_result(result)
      $stderr.puts "RubyLens collections contain private codebase structure from every included project. Keep the output local unless you intend to share it."
      0
    end

    def generate(command, arguments)
      specification = COMMANDS.fetch(command)
      options = {}
      help = false
      parser = OptionParser.new do |option|
        option.banner = "Usage: rubylens #{command} [OPTIONS] [TARGET]"
        option.separator ""
        option.separator "TARGET defaults to the current working directory."
        option.separator ""
        option.on("-o", "--output FILE", "Output #{specification.fetch(:output_kind)} (default: TARGET/#{specification.fetch(:default_name)})") do |value|
          options[:output] = value
        end
        option.on("--lockfile FILE", "Gemfile.lock used to select exact dependency versions") do |value|
          options[:lockfile] = value
        end
        if specification.fetch(:details_option)
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
      generator_options[:details] = options.fetch(:details, false) if specification.fetch(:details_option)
      generator_options[:progress] = progress_printer if specification.fetch(:report_progress)
      result = RubyLens.public_send(specification.fetch(:generator), **generator_options)
      print_result(result)
      $stderr.puts specification.fetch(:warning)
      0
    end

    def progress_printer
      last_step = -1
      lambda do |rendered, total|
        step = rendered * 10 / total
        next unless step > last_step

        last_step = step
        $stderr.puts "Rendering clip: #{rendered * 100 / total}% (#{rendered}/#{total} frames)"
      end
    end

    def print_result(result)
      $stdout.puts JSON.generate(result.to_payload)
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
          report [OPTIONS] [TARGET]     Generate a private, interactive galaxy report
          collection [OPTIONS] TARGET... Generate one private Explorer containing separate project galaxies
          clip [OPTIONS] [TARGET]       Generate a shareable galaxy video (MP4, needs Chrome + ffmpeg)
          showcase [OPTIONS] [TARGET]   Generate a shareable, cinematic galaxy showcase page
          version                       Print the RubyLens version

        Run `rubylens report --help`, `rubylens collection --help`, `rubylens clip --help`, or `rubylens showcase --help` for options.
      HELP
      status
    end
  end
end
