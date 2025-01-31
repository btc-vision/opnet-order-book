export default {
    /**
     * A set of globs passed to the glob package that qualify typescript files for testing.
     */
    entries: ['src/__tests__/**/*.spec.ts'],
    /**
     * A set of globs passed to the glob package that quality files to be added to each test.
     */
    include: ['src/__tests__/**/*.include.ts'],
    /**
     * A set of regexp that will disclude source files from testing.
     */
    disclude: [/node_modules/],
    /**
     * Add your required AssemblyScript imports here.
     */
    async instantiate(memory, createImports, instantiate, binary) {
        return instantiate(binary, createImports({ env: { memory } }));
    },
    /** Enable code coverage. */
    coverage: [
        'src/contracts/**/*.ts',
        'src/data-types/**/*.ts',
        'src/utils/**/*.ts',
        'src/events/**/*.ts',
        'src/lib/**/*.ts',
        'src/math/**/*.ts',
        'src/stored/**/*.ts',
    ],
    /**
     * Specify if the binary wasm file should be written to the file system.
     */
    outputBinary: false,
};
