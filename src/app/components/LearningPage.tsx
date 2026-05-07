import { useState } from 'react';
import { Play, CheckCircle2, Circle, Clock, BookOpen } from 'lucide-react';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';

interface Lesson {
  id: string;
  title: string;
  duration: string;
  completed: boolean;
  videoUrl: string;
}

const mockLessons: Lesson[] = [
  {
    id: '1',
    title: 'Introduction to AWS Cloud',
    duration: '12:30',
    completed: true,
    videoUrl: 'https://www.youtube.com/embed/a9__D53WsUs',
  },
  {
    id: '2',
    title: 'EC2 Fundamentals',
    duration: '18:45',
    completed: true,
    videoUrl: 'https://www.youtube.com/embed/iHX-jtKIVNA',
  },
  {
    id: '3',
    title: 'S3 Storage Deep Dive',
    duration: '15:20',
    completed: false,
    videoUrl: 'https://www.youtube.com/embed/tfU0JEZjcsg',
  },
  {
    id: '4',
    title: 'IAM Security Best Practices',
    duration: '20:15',
    completed: false,
    videoUrl: 'https://www.youtube.com/embed/ExjW7RiMdBs',
  },
  {
    id: '5',
    title: 'VPC and Networking',
    duration: '22:40',
    completed: false,
    videoUrl: 'https://www.youtube.com/embed/hiKPPy584Mg',
  },
  {
    id: '6',
    title: 'Lambda and Serverless',
    duration: '16:55',
    completed: false,
    videoUrl: 'https://www.youtube.com/embed/eOBq__h4OJ4',
  },
];

export default function LearningPage() {
  const [currentLesson, setCurrentLesson] = useState<Lesson>(mockLessons[2]);
  const [lessons, setLessons] = useState(mockLessons);

  const completedCount = lessons.filter((l) => l.completed).length;
  const progress = (completedCount / lessons.length) * 100;

  const markAsComplete = (lessonId: string) => {
    setLessons((prev) =>
      prev.map((lesson) =>
        lesson.id === lessonId ? { ...lesson, completed: true } : lesson
      )
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Video Player Section */}
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
          <div className="aspect-video bg-black">
            <iframe
              width="100%"
              height="100%"
              src={currentLesson.videoUrl}
              title={currentLesson.title}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>

          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-slate-900 mb-2">
                  {currentLesson.title}
                </h2>
                <div className="flex items-center gap-4 text-sm text-slate-600">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {currentLesson.duration}
                  </span>
                  {currentLesson.completed && (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Completed
                    </Badge>
                  )}
                </div>
              </div>

              {!currentLesson.completed && (
                <Button
                  onClick={() => markAsComplete(currentLesson.id)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Mark Complete
                </Button>
              )}
            </div>

            <div className="border-t border-slate-200 pt-4">
              <h3 className="font-medium text-slate-900 mb-2">About this lesson</h3>
              <p className="text-slate-600">
                Learn the fundamentals of AWS services and best practices for cloud computing.
                This lesson covers key concepts and hands-on demonstrations.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Lessons Sidebar */}
      <div className="space-y-4">
        {/* Progress Card */}
        <div className="bg-white rounded-xl shadow border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900">Your Progress</h3>
            <span className="text-sm font-medium text-orange-600">
              {completedCount}/{lessons.length}
            </span>
          </div>
          <Progress value={progress} className="h-2 mb-2" />
          <p className="text-sm text-slate-600">
            {completedCount === lessons.length
              ? 'Course completed! 🎉'
              : `${lessons.length - completedCount} lessons remaining`}
          </p>
        </div>

        {/* Lessons List */}
        <div className="bg-white rounded-xl shadow border border-slate-200">
          <div className="p-4 border-b border-slate-200">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-orange-600" />
              Course Modules
            </h3>
          </div>

          <div className="divide-y divide-slate-200">
            {lessons.map((lesson, index) => (
              <button
                key={lesson.id}
                onClick={() => setCurrentLesson(lesson)}
                className={`w-full p-4 text-left hover:bg-slate-50 transition-colors ${
                  currentLesson.id === lesson.id ? 'bg-orange-50' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {lesson.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : currentLesson.id === lesson.id ? (
                      <Play className="w-5 h-5 text-orange-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-300" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-slate-500">
                        Lesson {index + 1}
                      </span>
                      {currentLesson.id === lesson.id && (
                        <Badge variant="outline" className="text-xs border-orange-300 text-orange-700">
                          Playing
                        </Badge>
                      )}
                    </div>
                    <p className={`text-sm font-medium mb-1 ${
                      currentLesson.id === lesson.id ? 'text-orange-700' : 'text-slate-900'
                    }`}>
                      {lesson.title}
                    </p>
                    <p className="text-xs text-slate-500">{lesson.duration}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
