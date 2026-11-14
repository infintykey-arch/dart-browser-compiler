import 'dart:io';

void main() {
  final file = File('notes/hello.txt');
  file.writeAsStringSync('Saved in IndexedDB');
  print(file.readAsStringSync());
  print(file.existsSync());
}
