# frozen_string_literal: true

require_relative "rubylens/version"
require_relative "rubylens/errors"
require_relative "rubylens/paths"
require_relative "rubylens/git_repository"
require_relative "rubylens/index/manifest"
require_relative "rubylens/index/rubydex_adapter"
require_relative "rubylens/art_model_builder"
require_relative "rubylens/report_asset_assembler"
require_relative "rubylens/report_writer"
require_relative "rubylens/generator"
require_relative "rubylens/gif_writer"
require_relative "rubylens/gif_generator"

module RubyLens
  module_function

  def generate(path: Dir.pwd, output: nil, lockfile: nil)
    Generator.new.call(path: path, output: output, lockfile: lockfile)
  end

  def generate_gif(
    path: Dir.pwd,
    output: nil,
    lockfile: nil,
    duration: GifWriter::DEFAULT_DURATION,
    fps: GifWriter::DEFAULT_FPS,
    width: GifWriter::DEFAULT_WIDTH,
    height: GifWriter::DEFAULT_HEIGHT,
    browser_path: nil,
    ffmpeg_path: nil,
    &progress
  )
    GifGenerator.new.call(
      path:, output:, lockfile:, duration:, fps:, width:, height:, browser_path:, ffmpeg_path:, &progress
    )
  end
end

require_relative "rubylens/cli"
