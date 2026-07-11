# frozen_string_literal: true

require_relative "lib/rubylens/version"

Gem::Specification.new do |specification|
  specification.name = "rubylens"
  specification.version = RubyLens::VERSION
  specification.authors = ["RubyLens contributors"]
  specification.summary = "Turn a Ruby codebase into an interactive semantic artwork"
  specification.description = <<~DESCRIPTION.strip
    RubyLens uses Rubydex to index Ruby semantics and generate private, local-first
    data for interactive whole-codebase visualizations.
  DESCRIPTION
  specification.required_ruby_version = ">= 3.2.0", "< 4.1.dev"

  specification.files = [
    "README.md",
    "assets/report.html",
    "exe/rubylens",
    "lib/rubylens.rb",
    *Dir["lib/rubylens/{art_model_builder,cli,errors,generator,git_repository,paths,report_writer,version}.rb"],
    *Dir["lib/rubylens/index/*.rb"],
  ]
  specification.bindir = "exe"
  specification.executables = ["rubylens"]
  specification.require_paths = ["lib"]

  specification.add_dependency "rubydex", "= 0.2.9"
  specification.add_dependency "base64", ">= 0.2"
end
