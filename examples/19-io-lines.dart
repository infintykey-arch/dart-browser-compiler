import 'dart:io';

void main() {
  final file = File('lines.txt');
  file.writeAsStringSync('one\ntwo\nthree');
  for (final line in file.readAsLinesSync()) {
    print(line);
  }
}
