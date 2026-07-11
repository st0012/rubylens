# frozen_string_literal: true

require_relative "lib/rubylens/version"

Gem::Specification.new do |specification|
  specification.name = "rubylens"
  specification.version = RubyLens::VERSION
  specification.authors = ["RubyLens contributors"]
  specification.summary = "Turn a Ruby codebase into self-contained stellar HTML"
  specification.description = <<~DESCRIPTION.strip
    RubyLens uses Rubydex to index Ruby semantics and generate private, local-first
    data for local interactive reports and autonomous visual showcases.
  DESCRIPTION
  specification.required_ruby_version = ">= 3.2.0", "< 4.1.dev"

  specification.files = [
    "README.md",
    "assets/runtime/report.js",
    "assets/shells/report.html",
    "assets/shells/showcase.html",
    "assets/styles/report.css",
    "assets/styles/showcase.css",
    "docs/MONOREPO_BOUNDARIES.md",
    "docs/PERFORMANCE.md",
    "docs/REFERENCE_ROUTES_FUTURE.md",
    "exe/rubylens",
    "lib/rubylens.rb",
    *Dir["lib/rubylens/{art_model_builder,cli,errors,generator,git_repository,paths,report_asset_assembler,report_writer,showcase_generator,showcase_model,showcase_writer,version}.rb"],
    *Dir["lib/rubylens/index/*.rb"],
    *Dir["lib/rubylens/model/*.rb"],
  ]
  specification.bindir = "exe"
  specification.executables = ["rubylens"]
  specification.require_paths = ["lib"]

  specification.add_dependency "rubydex", "= 0.2.9"
  specification.add_dependency "base64", ">= 0.2"
end
