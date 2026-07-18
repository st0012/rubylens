# frozen_string_literal: true

module RubyLens
  module DependencyWarning
    REASONS = {
      checkout_unavailable: "Bundler checkout is unavailable",
      local_only_required: "Bundler source is not available for local-only indexing",
      specification_unavailable: "Locked gemspec is unavailable in the Bundler checkout",
      specification_unreadable: "Locked gemspec could not be loaded from the Bundler checkout",
      unsafe_specification_root: "Locked gemspec or package root failed containment checks",
      unsafe_require_paths: "Locked require paths failed containment checks",
      unsafe_package_files: "Locked package files failed containment checks",
    }.freeze
    ALLOWED_REASONS = REASONS.values.freeze
    NAME_PATTERN = /\A[A-Za-z0-9][A-Za-z0-9_.-]*\z/
  end
end
